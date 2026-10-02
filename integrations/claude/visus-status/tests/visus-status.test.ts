import { expect, test } from 'claude-code/testing'

const ROOT = '/work/project'

// What Claude Code passes to a ui.render hook for the visus pane, apart from the app
const PANE = {
  plugin: 'visus-status',
  component: 'Pane',
  requestId: 'visus',
  viewport: { columns: 160, rows: 40 },
  props: { title: 'visus', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

// Answers $.session.root, $.process.run and $.ui.open, recording each check and each opened pane
function stubCheck(on, stdout: string, argv: string[][] = [], opened: string[] = []) {
  on('session.root', () => ({ value: ROOT }))
  on('process.run', ($, e) => {
    argv.push(e.argv)
    return { value: { exitCode: 0, stdout, stderr: '' } }
  })
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
}

const turnEnd = (turnId: string) => ({ turnId, answer: 'done', durationMs: 1, isAborted: false, usage: null })

test('/visus reports a fresh review with its revision', async ($, on) => {
  const argv: string[][] = []
  stubCheck(on, JSON.stringify({ status: 'fresh', revision: 3, sourceId: 's', pending: [], stories: [] }), argv)

  const answer = await $.command.run({ command: 'visus', args: '' })
  expect(answer.text).toBe('Change story fresh · revision 3')
  expect(argv).toEqual([['visus', 'check', '--root', ROOT]])
})

test('/visus counts pending references for an incomplete review', async ($, on) => {
  stubCheck(on, JSON.stringify({ status: 'incomplete', revision: 2, sourceId: 's', pending: ['a', 'b'], stories: [] }))

  const answer = await $.command.run({ command: 'visus', args: '' })
  expect(answer.text).toBe('Change story incomplete · 2 pending')
})

test('/visus explains a missing CLI', async ($, on) => {
  on('session.root', () => ({ value: ROOT }))
  on('process.run', () => ({ deny: 'not found' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const answer = await $.command.run({ command: 'visus', args: '' })
  expect(answer.text).toMatch(/CLI not found/)
})

test('session start registers /visus without running a check', async ($, on) => {
  const argv: string[][] = []
  const registered: string[] = []
  stubCheck(on, '{}', argv)
  on('command.register', ($, e) => {
    registered.push(e.name)
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: ROOT }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: ROOT })
  expect(registered).toEqual(['visus'])
  expect(argv).toEqual([])
})

test('edits never run a check until /visus has been used', async ($, on) => {
  const argv: string[][] = []
  stubCheck(on, JSON.stringify({ status: 'stale', revision: 4, sourceId: 's', pending: [], stories: [] }), argv)
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))

  await $.tool.call({ tool: 'Edit', file_path: 'README.md', old_string: 'a', new_string: 'b' })
  await $.turn.complete(turnEnd('t1'))
  expect(argv.length).toBe(0)
})

test('after /visus, an edit shows in the pane and the turn end rechecks', async ($, on) => {
  const argv: string[][] = []
  stubCheck(on, JSON.stringify({ status: 'stale', revision: 4, sourceId: 's', pending: [], stories: [] }), argv)
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))

  await $.command.run({ command: 'visus', args: '' })
  expect(argv.length).toBe(1)

  await $.tool.call({ tool: 'Read', file_path: 'README.md' })
  await $.tool.call({ tool: 'Edit', file_path: 'README.md', old_string: 'a', new_string: 'b' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'edited · rechecks when the turn ends' })).toBeDefined()
  await ui.unmount()

  await $.turn.complete(turnEnd('t1'))
  expect(argv.length).toBe(2)

  // A turn without edits doesn't run the check again
  await $.turn.complete(turnEnd('t2'))
  expect(argv.length).toBe(2)
})

test('/visus opens a pane that lists the stories by kind', async ($, on) => {
  const opened: string[] = []
  const report = {
    status: 'incomplete',
    revision: 2,
    sourceId: 's',
    pending: ['a'],
    stories: [
      { id: 'save', title: 'Keep your settings when saving fails', kinds: ['implementation', 'tests'] },
      { id: 'docs', title: 'Explain retries in the guide', kinds: ['docs'] },
    ],
  }
  stubCheck(on, JSON.stringify(report), [], opened)

  await $.command.run({ command: 'visus', args: '' })
  expect(opened).toEqual(['visus'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: 'incomplete · 1 pending' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '2 stories' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '🔧🧪 Keep your settings when saving fails' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '📝 Explain retries in the guide' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '🔧 implementation  🧪 tests  📝 docs' })).toBeDefined()
    await ui.unmount()
  }
})
