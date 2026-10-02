// Tools whose edits can make the published change story stale
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

// The pane's id, used to open it and to recognize it when drawing
const PANE = 'visus'

// A color for each status and change kind
const STATUS_COLORS = { fresh: 'green', incomplete: 'yellow', stale: 'red', missing: 'red', edited: 'yellow' }
// An emoji for each change kind, chosen to be one glyph wide without a variation selector
const KIND_EMOJI = {
  implementation: '🔧',
  tests: '🧪',
  config: '🔩',
  docs: '📝',
  refactor: '🧹',
  dependencies: '📦',
  generated: '🤖',
  other: '📎',
}
const emojiOf = (kind) => KIND_EMOJI[kind] ?? KIND_EMOJI.other

// Set when Claude edits a file during the current turn
let edited = false

// The last `visus check` result, or an error message when it failed
let review = null
let problem = null

// Runs `visus check` in the session's project and keeps its result
async function check($) {
  const root = await $.session.root()
  let run
  try {
    run = await $.process.run(['visus', 'check', '--root', root])
  } catch {
    review = null
    problem = 'visus CLI not found on PATH (run npm link in the visus checkout)'
    return
  }
  try {
    review = JSON.parse(run.stdout)
    problem = null
  } catch {
    review = null
    problem = 'check failed' + (run.stderr ? ': ' + run.stderr.trim().split('\n')[0] : '')
  }
}

// One line that describes the last result
function summarize() {
  if (problem) return problem
  if (review.status === 'incomplete') return 'incomplete · ' + review.pending.length + ' pending'
  if (review.status === 'fresh' || review.status === 'stale') return review.status + ' · revision ' + review.revision
  return review.status
}

// Runs the check, then redraws the pane
async function refresh($) {
  await check($)
  $.ui.invalidate('ui.render')
  return summarize()
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'visus', description: 'Check the visus change story and show it in a pane', immediate: true })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (!edited && EDIT_TOOLS.includes(e.tool)) {
      edited = true
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    // Recheck only after /visus has shown the pane in this session
    const shown = review !== null || problem !== null
    if (edited && shown) await refresh($)
    edited = false
    return next(e)
  })

  on('command.run', { command: 'visus' }, async ($) => {
    const summary = await refresh($)
    await $.ui.open({ id: PANE, title: 'visus', closeOnEscape: true })
    return { text: 'Change story ' + summary }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    const status = edited ? 'edited' : problem ? 'missing' : review?.status ?? 'missing'
    const header = Text({
      children: [
        Text({ color: STATUS_COLORS[status] ?? 'gray', children: ['● '] }),
        Text({ bold: true, children: [edited ? 'edited · rechecks when the turn ends' : review || problem ? summarize() : 'checking…'] }),
      ],
    })

    const stories = review?.stories ?? []
    const rows = stories.map((story) =>
      Text({
        wrap: 'truncate-end',
        children: [
          // One emoji for each kind of change in the story
          story.kinds.map(emojiOf).join('') + ' ' + story.title,
        ],
      }),
    )

    const kinds = [...new Set(stories.flatMap((story) => story.kinds))]
    const legend = Text({
      dimColor: true,
      children: [kinds.map((kind) => emojiOf(kind) + ' ' + kind).join('  ')],
    })

    return Box({
      flexDirection: 'column',
      children: [
        header,
        Text({ children: [' '] }),
        Text({ dimColor: true, children: [stories.length + (stories.length === 1 ? ' story' : ' stories')] }),
        ...rows,
        ...(kinds.length ? [Text({ children: [' '] }), legend] : []),
      ],
    })
  })
}
