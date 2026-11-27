/* Mathify planner designer v1.
 *
 * Local curriculum authoring only. The draft follows the server planner schema:
 * every block carries trainer-only guidance, sketch spaces are real and
 * expandable, and the student-facing copy never includes trainer notes. */

(function () {
  'use strict';

  var STORAGE_KEY = 'mathify.lms.planner.v1';
  var BLOCK_TYPES = ['heading', 'text', 'image', 'sketch_space', 'analogy', 'story'];
  var FORBIDDEN = /trainerInstructions|trainer_instructions|misconception_watch|prompt_for_trainer|answerKey|correctOptionId|hints/i;

  function $(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function defaultDraft() {
    return {
      topic_id: 'equivalent-ratios',
      board: 'CBSE',
      grade: 5,
      chapter: 'NCERT Class 5 Ratios',
      learning_objectives: 'Identify equivalent ratios\nExplain a ratio with a drawing',
      quiz_prompt: 'Which pair of ratios is equivalent to 2 : 3?',
      quiz_image: '',
      estimated_minutes: 45,
      blocks: [
        block('b1', 'heading', {
          text: 'Equivalent ratios'
        }, 'Open with the pencil-box example. Ask what stays the same when both counts double.', [
          'Learners may compare only one side of the ratio.'
        ]),
        block('b2', 'analogy', {
          text: 'Two red pencils for three blue pencils is the same share as four red for six blue.',
          caption: 'Two pencil boxes with the same red-to-blue share.'
        }, 'Draw two boxes on the board. Keep the colour counts visible while narrating the shared ratio.', [
          'Do not let the child count only the red pencils.'
        ]),
        block('b3', 'sketch_space', {
          text: ''
        }, 'Ask the learner to redraw the box using four red and six blue pencils.', [
          'A child may scale one colour but not the other.'
        ], {
          minHeight: 240,
          expandable: true,
          prompt_for_trainer: 'Sketch two pencil boxes and circle the matching share.'
        }),
        block('b4', 'story', {
          text: 'Riya mixes 2 cups of juice with 3 cups of water. How would the taste stay the same for a larger jug?'
        }, 'Narrate slowly and pause before the scaling step.', [
          'Learners may add one cup to each side instead of multiplying both.'
        ]),
        block('b5', 'sketch_space', {
          text: ''
        }, 'Draw the small jug and the larger jug side by side; label both parts.', [
          'Watch for additive thinking.'
        ], {
          minHeight: 240,
          expandable: true,
          prompt_for_trainer: 'Sketch two jugs with matching 2 : 3 parts.'
        }),
        block('b6', 'text', {
          text: 'A ratio stays equal when both parts change by the same factor.'
        }, 'Write one worked example underneath the sentence; keep the wording short.', [
          'Avoid introducing cross-multiplication before the visual is clear.'
        ]),
        block('b7', 'sketch_space', {
          text: ''
        }, 'Leave this space open for the learner to draw their own example.', [
          'A blank space can feel like a test; offer a first stroke if needed.'
        ], {
          minHeight: 240,
          expandable: true,
          prompt_for_trainer: 'Sketch a blank ratio frame the learner can complete.'
        })
      ]
    };
  }

  function block(id, type, content, instructions, misconceptions, sketch) {
    return {
      id: id,
      type: type,
      content: {
        text: content.text || '',
        image_prompt: content.image_prompt || '',
        alt: content.alt || '',
        caption: content.caption || ''
      },
      sketch: sketch ? {
        minHeight: sketch.minHeight,
        expandable: sketch.expandable === true,
        prompt_for_trainer: sketch.prompt_for_trainer || ''
      } : null,
      trainerInstructions: instructions,
      misconception_watch: misconceptions.slice()
    };
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function loadDraft() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.blocks) && parsed.blocks.length) return parsed;
    } catch (error) { /* fall back to the seeded draft */ }
    return defaultDraft();
  }

  var draft = loadDraft();

  function saveDraft() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); } catch (error) { /* private mode */ }
  }

  function objectives() {
    return String(draft.learning_objectives || '').split('\n')
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; });
  }

  function buildPayload() {
    return {
      topic_id: String(draft.topic_id || '').trim() || 'planner-draft',
      curriculum_map: {
        board: String(draft.board || '').trim() || 'CBSE',
        grade: Number(draft.grade) || 5,
        chapter: String(draft.chapter || '').trim(),
        learning_objectives: objectives()
      },
      planner: {
        version: 1,
        estimated_minutes: Number(draft.estimated_minutes) || 45,
        blocks: draft.blocks.map(function (item) {
          var safe = clone(item);
          if (safe.type !== 'sketch_space') safe.sketch = undefined;
          if (!safe.sketch) delete safe.sketch;
          return safe;
        })
      }
    };
  }

  function studentBlocks() {
    return draft.blocks.map(function (item) {
      var safe = {
        id: item.id,
        type: item.type,
        content: clone(item.content)
      };
      if (item.type === 'sketch_space' && item.sketch) {
        safe.sketch = {
          minHeight: item.sketch.minHeight,
          expandable: item.sketch.expandable === true
        };
      }
      return safe;
    });
  }

  function buildStudentPayload() {
    return {
      topic_id: String(draft.topic_id || '').trim(),
      chapter: String(draft.chapter || '').trim(),
      quizPrompt: String(draft.quiz_prompt || '').trim(),
      quizImage: String(draft.quiz_image || '').trim(),
      blocks: studentBlocks()
    };
  }

  function validate() {
    var errors = [];
    var quizPrompt = String(draft.quiz_prompt || '').trim();
    var types = draft.blocks.map(function (item) { return item.type; });

    if (!String(draft.topic_id || '').trim()) errors.push('Add a topic id.');
    if (!(Number(draft.grade) > 0)) errors.push('Grade must be a positive number.');
    if (objectives().length === 0) errors.push('Add at least one learning objective.');
    if (!(Number(draft.estimated_minutes) >= 15)) errors.push('Estimated minutes must be at least 15.');

    ['analogy', 'story', 'sketch_space'].forEach(function (required) {
      if (types.indexOf(required) === -1) errors.push('Planner needs a ' + required + ' block.');
    });

    if (FORBIDDEN.test(quizPrompt)) {
      errors.push('Student quiz prompt contains a trainer-only field name.');
    }

    draft.blocks.forEach(function (item, index) {
      var label = (item.id || 'block ' + (index + 1));
      if (!String(item.id || '').trim()) errors.push('Block ' + (index + 1) + ' has no id.');
      if (BLOCK_TYPES.indexOf(item.type) === -1) errors.push(label + ' has an unknown type.');
      if (!String(item.trainerInstructions || '').trim()) {
        errors.push(label + ' needs trainerInstructions.');
      }
      if (!Array.isArray(item.misconception_watch) || item.misconception_watch.length === 0 ||
          !item.misconception_watch.every(function (note) { return String(note || '').trim().length > 0; })) {
        errors.push(label + ' needs at least one misconception to watch.');
      }

      var studentText = String((item.content && item.content.text) || '') + ' ' +
        String((item.content && item.content.caption) || '') + ' ' +
        String((item.content && item.content.image_prompt) || '');
      if (FORBIDDEN.test(studentText)) {
        errors.push(label + ' student content contains a trainer-only field name.');
      }
      if (quizPrompt && String(item.trainerInstructions || '').trim().length > 24 &&
          quizPrompt.indexOf(String(item.trainerInstructions).trim()) !== -1) {
        errors.push('Student quiz prompt repeats trainer instructions from ' + label + '.');
      }

      if (item.type === 'analogy' && !String((item.content && item.content.caption) || '').trim() &&
          !String((item.content && item.content.image_prompt) || '').trim()) {
        errors.push(label + ' analogy needs a caption or image prompt.');
      }

      if (item.type === 'sketch_space') {
        if (!item.sketch) errors.push(label + ' needs a sketch object.');
        else {
          if (!(Number(item.sketch.minHeight) >= 220)) {
            errors.push(label + ' sketch must be at least 220px high.');
          }
          if (item.sketch.expandable !== true) errors.push(label + ' sketch must be expandable.');
          if (!String(item.sketch.prompt_for_trainer || '').trim()) {
            errors.push(label + ' needs a trainer sketch prompt.');
          }
        }
      }

      var contentTypes = ['text', 'image', 'analogy', 'story'];
      if (contentTypes.indexOf(item.type) !== -1) {
        var next = draft.blocks[index + 1];
        if (!next || next.type !== 'sketch_space') {
          errors.push(label + ' must be followed by a sketch_space block.');
        }
      }
    });

    return errors;
  }

  function renderValidation(errors) {
    var target = $('plannerValidation');
    if (!target) return;
    target.innerHTML = '';
    target.className = 'validation ' + (errors.length ? 'bad' : 'ok');
    target.appendChild(el('span', 'mono', errors.length ? 'Needs attention' : 'Ready to export'));
    if (!errors.length) {
      target.appendChild(el('p', null, 'Schema and privacy checks passed. Trainer-only fields stay out of the student copy.'));
      return;
    }
    var list = el('ul');
    errors.forEach(function (error) { list.appendChild(el('li', null, error)); });
    target.appendChild(list);
  }

  function inputField(label, key, type) {
    var wrap = el('label', 'field');
    wrap.appendChild(el('span', 'field-label', label));
    var input = el(type === 'textarea' ? 'textarea' : 'input');
    if (type === 'textarea') input.rows = 2;
    else input.type = type === 'number' ? 'number' : 'text';
    if (type === 'number') {
      input.min = '1';
      input.step = '1';
    }
    input.value = draft[key] === null || draft[key] === undefined ? '' : String(draft[key]);
    input.setAttribute('data-draft-key', key);
    wrap.appendChild(input);
    return wrap;
  }

  function renderHeader(container) {
    var grid = el('div', 'planner-head-grid');
    grid.appendChild(inputField('Topic id', 'topic_id', 'text'));
    grid.appendChild(inputField('Board', 'board', 'text'));
    grid.appendChild(inputField('Grade', 'grade', 'number'));
    grid.appendChild(inputField('Chapter', 'chapter', 'text'));
    grid.appendChild(inputField('Estimated minutes', 'estimated_minutes', 'number'));
    container.appendChild(grid);

    var objectivesField = inputField('Learning objectives · one per line', 'learning_objectives', 'textarea');
    objectivesField.style.marginTop = '12px';
    container.appendChild(objectivesField);

    var quizField = inputField('Student-facing quiz prompt', 'quiz_prompt', 'textarea');
    quizField.style.marginTop = '12px';
    container.appendChild(quizField);

    var quizImageField = inputField('Question image URL (optional)', 'quiz_image', 'text');
    quizImageField.style.marginTop = '10px';
    container.appendChild(quizImageField);

    var transferRow = el('div', 'planner-transfer-row');
    var sendToBoard = el('button', 'btn btn-ghost btn-sm', 'Send question to whiteboard');
    sendToBoard.type = 'button';
    sendToBoard.id = 'plannerQuestionToBoard';
    transferRow.appendChild(sendToBoard);
    transferRow.appendChild(el('span', 'planner-transfer-note',
      'Opens the trainer board with only this question and its image.'));
    container.appendChild(transferRow);

    container.appendChild(el('div', 'planner-note',
      'Every block keeps trainer guidance separate. The quiz prompt is checked against trainer notes before export.'));
  }

  function setPath(object, key, value) {
    var parts = String(key).split('.');
    var cursor = object;
    parts.slice(0, -1).forEach(function (part) {
      if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
      cursor = cursor[part];
    });
    cursor[parts[parts.length - 1]] = value;
  }

  function ensureSketch(item) {
    if (!item.sketch) {
      item.sketch = { minHeight: 240, expandable: true, prompt_for_trainer: 'Describe what the trainer should draw.' };
    }
    return item.sketch;
  }

  function field(labelText, value, block, key, isTextarea) {
    var wrap = el('label', 'field');
    wrap.appendChild(el('span', 'field-label', labelText));
    var input = el(isTextarea ? 'textarea' : 'input');
    if (isTextarea) input.rows = 3;
    else input.type = key.indexOf('minHeight') !== -1 ? 'number' : 'text';
    input.value = value === null || value === undefined ? '' : String(value);
    input.setAttribute('data-block-id', block.id);
    input.setAttribute('data-block-key', key);
    wrap.appendChild(input);
    return wrap;
  }

  function renderBlocks(container) {
    container.innerHTML = '';
    draft.blocks.forEach(function (item, index) {
      var card = el('article', 'planner-block');
      var toolbar = el('div', 'block-toolbar');
      toolbar.appendChild(el('span', 'block-num', String(index + 1).padStart(2, '0')));

      var select = el('select');
      BLOCK_TYPES.forEach(function (type) {
        var option = el('option', null, type);
        option.value = type;
        select.appendChild(option);
      });
      select.value = item.type;
      select.setAttribute('data-block-id', item.id);
      select.setAttribute('data-block-key', 'type');
      select.setAttribute('aria-label', 'Block ' + (index + 1) + ' type');
      toolbar.appendChild(select);
      toolbar.appendChild(el('span', 'type-note', item.id));

      var remove = el('button', 'remove', 'Remove');
      remove.type = 'button';
      remove.setAttribute('data-remove-block', item.id);
      remove.setAttribute('aria-label', 'Remove block ' + item.id);
      toolbar.appendChild(remove);
      card.appendChild(toolbar);

      var split = el('div', 'block-split');
      var student = el('fieldset');
      student.appendChild(el('legend', null, 'Student content'));
      student.appendChild(field('Text', item.content.text, item, 'content.text', true));
      if (item.type === 'analogy' || item.type === 'image') {
        student.appendChild(field('Image prompt', item.content.image_prompt, item, 'content.image_prompt', true));
        student.appendChild(field('Caption', item.content.caption, item, 'content.caption', false));
      }
      split.appendChild(student);

      var trainer = el('fieldset', 'trainer');
      trainer.appendChild(el('legend', null, 'Trainer-only · never exported'));
      trainer.appendChild(field('Trainer instructions', item.trainerInstructions, item, 'trainerInstructions', true));
      trainer.appendChild(field('Misconception watch · one per line', item.misconception_watch.join('\n'), item, 'misconception_watch', true));
      if (item.type === 'sketch_space') {
        var sketch = ensureSketch(item);
        var sub = el('div', 'block-sub');
        sub.appendChild(field('Sketch prompt for trainer', sketch.prompt_for_trainer, item, 'sketch.prompt_for_trainer', true));
        var height = field('Minimum height (px)', sketch.minHeight, item, 'sketch.minHeight', false);
        height.querySelector('input').min = '220';
        sub.appendChild(height);
        trainer.appendChild(sub);
        var check = el('label', 'block-check');
        var checkbox = el('input');
        checkbox.type = 'checkbox';
        checkbox.checked = sketch.expandable === true;
        checkbox.setAttribute('data-block-id', item.id);
        checkbox.setAttribute('data-block-key', 'sketch.expandable');
        check.appendChild(checkbox);
        check.appendChild(el('span', null, 'Expandable sketch space'));
        trainer.appendChild(check);
      }
      trainer.appendChild(el('div', 'block-lock', 'Trainer-only fields are stripped from the student view and realtime events.'));
      split.appendChild(trainer);
      card.appendChild(split);
      container.appendChild(card);
    });
  }

  function render() {
    var target = $('plannerSheetContent');
    if (!target) return;
    target.innerHTML = '';

    var body = el('div', 'planner-body');
    renderHeader(body);

    var head = el('div', 'planner-section-head');
    var copy = el('div');
    copy.appendChild(el('span', 'mono', 'Lesson blocks'));
    copy.appendChild(el('p', null, 'Required: analogy, story and expandable sketch space. Each content block is followed by a sketch.'));
    head.appendChild(copy);
    var add = el('button', 'btn btn-ghost btn-sm', 'Add block');
    add.type = 'button';
    add.id = 'plannerAddBlock';
    head.appendChild(add);
    body.appendChild(head);

    var blocks = el('div', 'planner-blocks');
    blocks.id = 'plannerBlocks';
    body.appendChild(blocks);
    renderBlocks(blocks);

    var validation = el('div', 'validation ok');
    validation.id = 'plannerValidation';
    body.appendChild(validation);
    target.appendChild(body);

    var foot = el('footer', 'planner-foot');
    var reset = el('button', 'btn btn-ghost btn-sm', 'Reset draft');
    reset.type = 'button';
    reset.id = 'plannerResetBtn';
    var copyStudent = el('button', 'btn btn-ghost btn-sm', 'Copy student view');
    copyStudent.type = 'button';
    copyStudent.id = 'plannerStudentBtn';
    var validateButton = el('button', 'btn btn-ghost btn-sm', 'Validate');
    validateButton.type = 'button';
    validateButton.id = 'plannerValidateBtn';
    var exportButton = el('button', 'btn btn-coral btn-sm', 'Export planner JSON');
    exportButton.type = 'button';
    exportButton.id = 'plannerExportBtn';
    foot.appendChild(reset);
    foot.appendChild(copyStudent);
    foot.appendChild(validateButton);
    foot.appendChild(exportButton);
    target.appendChild(foot);
    bindLocal();
  }

  function bindLocal() {
    document.querySelectorAll('[data-draft-key]').forEach(function (input) {
      input.addEventListener('input', function () {
        draft[input.getAttribute('data-draft-key')] = input.value;
        saveDraft();
      });
    });

    document.querySelectorAll('[data-block-key]').forEach(function (input) {
      var handler = function () {
        var id = input.getAttribute('data-block-id');
        var item = draft.blocks.find(function (candidate) { return candidate.id === id; });
        if (!item) return;
        var key = input.getAttribute('data-block-key');
        if (key === 'type') {
          item.type = input.value;
          if (item.type === 'sketch_space') ensureSketch(item);
          saveDraft();
          renderBlocks($('plannerBlocks'));
          return;
        }
        if (key === 'sketch.expandable') {
          ensureSketch(item).expandable = input.checked;
        } else if (key === 'sketch.minHeight') {
          ensureSketch(item).minHeight = Number(input.value);
        } else if (key === 'misconception_watch') {
          item.misconception_watch = String(input.value).split('\n')
            .map(function (line) { return line.trim(); })
            .filter(function (line) { return line.length > 0; });
          return;
        } else {
          setPath(item, key, input.value);
        }
        saveDraft();
      };
      input.addEventListener(input.type === 'checkbox' ? 'change' : 'input', handler);
    });

    document.querySelectorAll('[data-remove-block]').forEach(function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-remove-block');
        draft.blocks = draft.blocks.filter(function (item) { return item.id !== id; });
        saveDraft();
        renderBlocks($('plannerBlocks'));
      });
    });

    var add = $('plannerAddBlock');
    if (add) add.addEventListener('click', function () {
      var number = draft.blocks.length + 1;
      draft.blocks.push(block('b' + number + '_' + Date.now().toString(36), 'text', {
        text: ''
      }, 'Describe what to say here.', ['Watch for a rushed answer.'], null));
      saveDraft();
      renderBlocks($('plannerBlocks'));
    });

    var validateButton = $('plannerValidateBtn');
    if (validateButton) validateButton.addEventListener('click', function () { renderValidation(validate()); });

    var exportButton = $('plannerExportBtn');
    if (exportButton) exportButton.addEventListener('click', function () {
      var errors = validate();
      renderValidation(errors);
      if (errors.length) return;
      var blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = el('a');
      link.href = url;
      link.download = 'mathify-planner-' + String(draft.topic_id || 'draft') + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });

    var copyButton = $('plannerStudentBtn');
    if (copyButton) copyButton.addEventListener('click', function () {
      var text = JSON.stringify(buildStudentPayload(), null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
      } else fallbackCopy(text);
    });

    var sendButton = $('plannerQuestionToBoard');
    if (sendButton) sendButton.addEventListener('click', function () {
      var prompt = String(draft.quiz_prompt || '').trim();
      var image = String(draft.quiz_image || '').trim();
      if (!prompt) {
        renderValidation(['Add a student-facing quiz prompt before sending it to the whiteboard.']);
        var input = document.querySelector('[data-draft-key="quiz_prompt"]');
        if (input && input.focus) input.focus();
        return;
      }
      try {
        window.localStorage.setItem('mathify.planner.question', JSON.stringify({
          id: 'planner_' + Date.now(),
          q: prompt,
          image: image || null,
          at: Date.now()
        }));
      } catch (error) { /* private mode: the classroom cannot receive the handoff */ }
      var params = new URLSearchParams(window.location.search);
      var sessionId = window.MATHIFY_SESSION_ID ||
        window.localStorage.getItem('mathify.trainer.sessionId') ||
        params.get('sessionId') || 'ses_math_001';
      var url = '../classroom/index.html?sessionId=' + encodeURIComponent(sessionId) +
        '&role=trainer&board=full&plannerQuestion=1&review=' + Date.now();
      if (!window.open(url, '_blank')) window.location.href = url;
    });

    var resetButton = $('plannerResetBtn');
    if (resetButton) resetButton.addEventListener('click', function () {
      draft = defaultDraft();
      saveDraft();
      render();
      renderValidation([]);
    });
  }

  function fallbackCopy(text) {
    var field = el('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    try { document.execCommand('copy'); } catch (error) { /* clipboard unavailable */ }
    document.body.removeChild(field);
  }

  window.mathifyPlanner = {
    render: render,
    validate: validate,
    buildPayload: buildPayload,
    buildStudentPayload: buildStudentPayload
  };

  render();
}());
