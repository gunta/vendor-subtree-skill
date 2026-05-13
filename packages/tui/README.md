# @ingraft/tui-workspace

Internal development wrapper for the `ingraft` OpenTUI dashboard.

The dashboard ships inside the single published `ingraft` package. Running `ingraft` with no arguments opens it.

```sh
bun run dev:tui
```

The dashboard reads `ingraft deps --json`, lets you inspect matched package repositories, select add/update tasks, preview the exact CLI commands, and run them after an explicit confirmation.

Keys:

- `j` / `k` or arrow keys: move task focus
- `space`: toggle the focused task
- `a`: select all tasks
- `c`: clear selection
- `enter`: confirm the selected tasks, or the focused task if none are selected
- `y` / `n`: run or cancel after confirmation
- `r`: refresh the dependency scan
- `tab`, `h`, `l`: switch dashboard tabs
- `1`, `2`, `3`: choose add strategy (`subtree`, `submodule`, `clone-ignore`)
- `q`: quit
