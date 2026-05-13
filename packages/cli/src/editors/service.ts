import { Context, Effect, Layer, Option } from "effect"

import { IntellijSettings } from "./intellij.ts"
import { VscodeSettings } from "./vscode.ts"
import { ZedSettings } from "./zed.ts"

export interface RefreshEditorSettingsParams {
  readonly cwd: string
}

const optionToArray = <A>(option: Option.Option<A>): ReadonlyArray<A> =>
  Option.match(option, {
    onNone: () => [],
    onSome: (value) => [value]
  })

export interface EditorSettingsShape {
  readonly refresh: (
    params: RefreshEditorSettingsParams
  ) => Effect.Effect<ReadonlyArray<string>, unknown>
}

export class EditorSettings extends Context.Service<EditorSettings, EditorSettingsShape>()(
  "ingraft/EditorSettings"
) {}

export const EditorSettingsLive = Layer.effect(
  EditorSettings,
  Effect.gen(function* () {
    const intellij = yield* IntellijSettings
    const vscode = yield* VscodeSettings
    const zed = yield* ZedSettings

    return {
      refresh: ({ cwd }: RefreshEditorSettingsParams) =>
        Effect.all(
          {
            intellij: intellij.refresh(cwd),
            vscode: vscode.refresh(cwd),
            zed: zed.refresh(cwd)
          },
          { concurrency: 3 }
        ).pipe(
          Effect.map(({ intellij, vscode, zed }) => [
            ...optionToArray(vscode),
            ...optionToArray(zed),
            ...intellij
          ])
        )
    }
  })
)
