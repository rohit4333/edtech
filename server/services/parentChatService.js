/* Parent↔trainer private chat service.
 *
 * Strict 1-on-1 model: one thread per student (thread id === student id),
 * with exactly one parent and one roster trainer. No groups, no batches.
 *
 * Privacy rules enforced here, not only in the routes:
 *  - parent may read/send only in the thread for their own child;
 *  - trainer may read/send only for students on their roster;
 *  - founder has read-only audit access to every thread and to privacy flags;
 *  - every send is scanned by parentChatDlp before any write or delivery;
 *  - blocked content is stored only as a founder-only flag with a masked
 *    preview, never as a message, never echoed, never published to Realtime;
 *  - unread counts are per recipient in the service-only record store.
 *
 * All persistence goes through db (service-role facade). Browser Data API
 * roles never read these collections.
 */

const db = require('../db');
const dlp = require('./parentChatDlp');

const MAX_MESSAGES = 100;
const MAX_BODY_LENGTH = 2000;
const NEUTRAL_BLOCK_MESSAGE = dlp.NEUTRAL_BLOCK_MESSAGE;

function problem(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 400;
  return error;
}

function forbidden() {
  return problem('FORBIDDEN', 'You are not part of this conversation.', 403);
}

function boundedLimit(limit, maximum) {
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return maximum;
  return Math.min(maximum, Math.floor(value));
}

async function actorFor(user) {
  if (!user || !user.id) return null;
  const stored = await db.findUserById(user.id);
  return stored || user;
}

async function threadOwners(studentId) {
  const sessions = await db.listAllSessions();
  const session = Array.isArray(sessions)
    ? sessions.find(function (item) { return item.studentId === studentId; })
    : null;
  const users = await db.listUsers();
  const parent = Array.isArray(users)
    ? users.find(function (item) { return item.role === 'parent' && item.childId === studentId; })
    : null;
  return {
    trainerId: session ? session.trainerId : null,
    parentId: parent ? parent.id : null
  };
}

/* One authorization path for every operation. 'read' also permits founder
   audit; 'write' is restricted to the two real participants. */
async function authorize(user, requestedStudentId, mode) {
  const actor = await actorFor(user);
  if (!actor) throw problem('UNAUTHORIZED', 'Sign in to continue.', 401);

  const studentId = requestedStudentId || (actor.role === 'parent' ? actor.childId : null);
  if (!studentId) {
    throw problem('STUDENT_REQUIRED', 'A student thread is required.', 400);
  }

  const student = await db.findUserById(studentId);
  if (!student || student.role !== 'student') throw forbidden();

  if (actor.role === 'parent') {
    if (!actor.childId || actor.childId !== studentId) throw forbidden();
  } else if (actor.role === 'trainer') {
    const roster = await db.listSessionsForUser({ id: actor.id, role: 'trainer' });
    if (!roster.some(function (session) { return session.studentId === studentId; })) throw forbidden();
  } else if (actor.role === 'founder') {
    if (mode !== 'read') {
      throw problem('FORBIDDEN', 'Founder access to parent chat is read-only.', 403);
    }
  } else {
    throw forbidden();
  }

  const owners = await threadOwners(studentId);
  if (actor.role === 'parent') owners.parentId = actor.id;
  if (actor.role === 'trainer') owners.trainerId = actor.id;

  return {
    threadId: String(studentId),
    studentId: String(studentId),
    actor: actor,
    owners: owners
  };
}

function safeMessage(record) {
  return {
    id: record.id,
    threadId: record.threadId,
    studentId: record.studentId,
    senderId: record.senderId,
    senderRole: record.senderRole,
    body: record.body,
    createdAt: record.createdAt
  };
}

function safeFlag(record) {
  return {
    id: record.id,
    threadId: record.threadId || null,
    studentId: record.studentId || null,
    actorId: record.actorId || null,
    actorRole: record.actorRole || null,
    reason: record.reason || null,
    reasonCode: record.reason || null,
    reasonLabel: record.reasonLabel || null,
    reasons: Array.isArray(record.reasons) ? record.reasons.slice() : [],
    maskedPreview: record.maskedPreview || '••••',
    createdAt: record.createdAt || null
  };
}

function normalizeBody(value) {
  if (typeof value !== 'string') {
    throw problem('INVALID_MESSAGE', 'A text message is required.', 400);
  }
  const body = value.trim();
  if (!body) throw problem('INVALID_MESSAGE', 'A text message is required.', 400);
  if (body.length > MAX_BODY_LENGTH) {
    throw problem('INVALID_MESSAGE', 'Messages must be at most ' + MAX_BODY_LENGTH + ' characters.', 400);
  }
  return body;
}

async function bumpUnread(threadId, recipientId, messageId, at) {
  const current = await db.findParentChatRead(threadId, recipientId);
  const state = current || {
    threadId: threadId,
    recipientId: recipientId,
    unreadCount: 0,
    lastReadAt: null,
    lastReadMessageId: null
  };
  state.unreadCount = (Number(state.unreadCount) || 0) + 1;
  state.latestMessageId = messageId || null;
  state.updatedAt = at;
  return db.saveParentChatRead(state);
}

/* GET thread: newest bounded window (default/max 100) plus viewer unread. */
async function getThread(user, studentId, limit) {
  const context = await authorize(user, studentId, 'read');
  const size = boundedLimit(limit, MAX_MESSAGES);
  const rows = await db.listParentChatMessages(context.threadId, size);
  const read = await db.findParentChatRead(context.threadId, context.actor.id);
  return {
    threadId: context.threadId,
    studentId: context.studentId,
    messages: rows.map(safeMessage),
    unreadCount: read ? (Number(read.unreadCount) || 0) : 0,
    limit: size
  };
}

/* POST message: the only returned payload is the delivered safe message.
   A DLP hit writes a flag and raises CONTENT_BLOCKED (HTTP 422). */
async function sendMessage(user, studentId, rawBody) {
  const context = await authorize(user, studentId, 'write');
  const body = normalizeBody(rawBody);
  const decision = dlp.inspect(body);
  const at = new Date().toISOString();

  if (decision.blocked) {
    await db.insertParentChatFlag({
      threadId: context.threadId,
      studentId: context.studentId,
      actorId: context.actor.id,
      actorRole: context.actor.role,
      reason: decision.reason,
      reasonCode: decision.reason,
      reasonLabel: decision.reasonLabel,
      reasons: decision.reasons.slice(),
      maskedPreview: decision.maskedPreview,
      createdAt: at
    });
    /* Deliberately no db.insertParentChatMessage and no realtime.publish call.
       The thrown message is neutral and contains none of the raw input. */
    throw problem('CONTENT_BLOCKED', NEUTRAL_BLOCK_MESSAGE, 422);
  }

  const recipientId = context.actor.role === 'parent'
    ? context.owners.trainerId
    : context.owners.parentId;
  if (!recipientId) {
    throw problem('THREAD_UNAVAILABLE', 'This conversation is not available yet.', 409);
  }

  const message = await db.insertParentChatMessage({
    threadId: context.threadId,
    studentId: context.studentId,
    parentId: context.owners.parentId,
    trainerId: context.owners.trainerId,
    senderId: context.actor.id,
    senderRole: context.actor.role,
    recipientId: recipientId,
    body: body,
    createdAt: at
  });

  await bumpUnread(context.threadId, recipientId, message.id, at);
  return { message: safeMessage(message) };
}

/* POST mark-read: clears only the caller's own unread counter. */
async function markRead(user, studentId, body) {
  const context = await authorize(user, studentId, 'write');
  const input = body || {};
  const at = new Date().toISOString();
  const current = await db.findParentChatRead(context.threadId, context.actor.id);
  const messageId = typeof input.messageId === 'string' ? input.messageId.slice(0, 120) : null;

  await db.saveParentChatRead({
    threadId: context.threadId,
    recipientId: context.actor.id,
    unreadCount: 0,
    lastReadAt: at,
    lastReadMessageId: messageId || (current && current.lastReadMessageId) || null,
    latestMessageId: current && current.latestMessageId ? current.latestMessageId : null,
    updatedAt: at
  });

  return {
    ok: true,
    threadId: context.threadId,
    unreadCount: 0,
    markedAt: at
  };
}

/* GET dashboard summary. Parent sees their child's thread; trainer sees only
   roster threads. Founder may audit the same summary across all threads. */
async function unreadSummary(user) {
  const actor = await actorFor(user);
  if (!actor) throw problem('UNAUTHORIZED', 'Sign in to continue.', 401);

  let studentIds = [];
  if (actor.role === 'parent') {
    studentIds = actor.childId ? [actor.childId] : [];
  } else if (actor.role === 'trainer') {
    const roster = await db.listSessionsForUser({ id: actor.id, role: 'trainer' });
    studentIds = roster.map(function (session) { return session.studentId; });
  } else if (actor.role === 'founder') {
    const sessions = await db.listAllSessions();
    studentIds = sessions.map(function (session) { return session.studentId; });
  } else {
    throw forbidden();
  }

  const unique = [];
  studentIds.forEach(function (id) { if (id && unique.indexOf(id) === -1) unique.push(id); });

  const threads = [];
  for (let index = 0; index < unique.length; index += 1) {
    const studentId = unique[index];
    const read = await db.findParentChatRead(studentId, actor.id);
    const count = read ? (Number(read.unreadCount) || 0) : 0;
    threads.push({ threadId: studentId, studentId: studentId, unreadCount: count });
  }
  threads.sort(function (left, right) {
    return right.unreadCount - left.unreadCount ||
      String(left.threadId).localeCompare(String(right.threadId));
  });

  const total = threads.reduce(function (sum, item) { return sum + item.unreadCount; }, 0);
  return { total: total, unreadCount: total, threads: threads };
}

/* GET founder-only privacy flags. Only masked previews and reason codes are
   serialized; blocked raw text is never stored anywhere. */
async function listFlags(user, limit) {
  const actor = await actorFor(user);
  if (!actor || actor.role !== 'founder') throw forbidden();
  const rows = await db.listParentChatFlags(boundedLimit(limit, 200));
  return { flags: rows.map(safeFlag) };
}

module.exports = {
  MAX_MESSAGES,
  NEUTRAL_BLOCK_MESSAGE,
  getThread: getThread,
  sendMessage: sendMessage,
  markRead: markRead,
  unreadSummary: unreadSummary,
  listFlags: listFlags
};
