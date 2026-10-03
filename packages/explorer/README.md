# visus explorer

The React explorer is rendered by the local browser server and by the VS Code extension. It reads a published report and never edits it.

## Reading a review

The explorer shows the selected story's plain-language outcome first. Expand **What it affects** for named areas and visual connections, **Why these choices** for reasoning, or **Code references** for supporting files. Each story starts with these sections collapsed. The story list shows titles and categories; **Filter & group** reveals the optional organization controls. Unexplained changes remain visible as a count, with their files available on expansion. These explanations come from the published report; direct and inferred relationships remain labeled as author reported. In VS Code, opening a reference goes directly to the editor's captured diff. In the browser, it opens an optional snapshot preview.

**What it affects** uses [Dagre](https://github.com/dagrejs/dagre/wiki) to lay out a connected diagram from the report's existing relationships. Areas appear once, with solid arrows for direct connections and dashed arrows for inferred ones. Select a numbered arrow or its matching button to read one connection's explanation and expand its supporting code references. The diagram keeps readable labels and scrolls in narrow panes; other affected areas appear separately without invented connections. Rendering runs locally in the browser or VS Code webview.

## Design notes

The layout uses compact type and spacing for editor panes, with fewer divider lines. Headings, body text, and technical labels use distinct font roles with local fallbacks. Faint gray lines curve gently like a bent sheet of paper, fade across each outer quarter, and leave the middle half transparent. Muted category colors add depth; narrow panes keep the story list in a bounded scroll area above the selected story. Subtle, static blue glows mark the selected story and its explanation; amber highlights pending work, and red highlights stale or unavailable reviews.

The controls use local source copies of [beUI motion components](https://beui.dev/components/motion): Button, Tabs, Select, Animated Badge, and Center Morph Modal. Category filters apply to published stories; unexplained changes stay visible. Tabs and category options support arrow keys. Tab labels use one text layer and content switches without an entrance fade; buttons use a small press response without hover scaling, and status text updates without a rolling blur. Components respect the system's reduced motion setting. Storybook includes connected, inferred, summary-only, and unavailable-reference explanation previews.

## Development

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the Vite dev server, demo mode, and Storybook commands.
