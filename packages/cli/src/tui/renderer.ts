import { createCliRenderer, type CliRenderer, type KeyEvent, type VNode } from "@opentui/core"
import { Context, Effect, Layer, Queue, Stream } from "effect"

import { TuiRendererFailed } from "../domain/errors.ts"

export type RenderableNode = VNode<any, any[]>

export interface TerminalSize {
  readonly width: number
  readonly height: number
}

export interface TuiRendererShape {
  readonly render: (node: RenderableNode) => Effect.Effect<void>
  readonly terminalSize: Effect.Effect<TerminalSize>
  readonly keyEvents: Stream.Stream<KeyEvent>
  readonly shutdown: Effect.Effect<void>
}

export class TuiRenderer extends Context.Service<TuiRenderer, TuiRendererShape>()(
  "ingraft/TuiRenderer"
) {}

const acquireRenderer = (backgroundColor: string) =>
  Effect.tryPromise({
    try: () =>
      createCliRenderer({
        backgroundColor,
        clearOnShutdown: true,
        enableMouseMovement: true,
        exitOnCtrlC: true,
        targetFps: 30,
        useMouse: true
      }),
    catch: (cause) => new TuiRendererFailed({ phase: "acquire", cause })
  })

const releaseRenderer = (renderer: CliRenderer) =>
  Effect.sync(() => {
    try {
      renderer.destroy()
    } catch {
      // ignore: renderer may already be destroyed
    }
  })

const keyStream = (renderer: CliRenderer): Stream.Stream<KeyEvent> =>
  Stream.callback<KeyEvent>((queue) =>
    Effect.gen(function* () {
      const handler = (key: KeyEvent) => {
        Queue.offerUnsafe(queue, key)
      }
      renderer.keyInput.on("keypress", handler)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          try {
            renderer.keyInput.off("keypress", handler)
          } catch {
            // ignore
          }
        })
      )
    })
  )

export const tuiRendererLayer = (backgroundColor: string) =>
  Layer.effect(
    TuiRenderer,
    Effect.gen(function* () {
      const renderer = yield* Effect.acquireRelease(
        acquireRenderer(backgroundColor),
        releaseRenderer
      )

      const render = Effect.fn("TuiRenderer.render")(function* (node: RenderableNode) {
        yield* Effect.sync(() => {
          const previous = renderer.root.findDescendantById("dashboard")
          if (previous !== undefined) renderer.root.remove("dashboard")
          renderer.root.add(node)
          renderer.requestRender()
        })
      })

      return TuiRenderer.of({
        render,
        terminalSize: Effect.sync(() => ({
          width: renderer.terminalWidth,
          height: renderer.terminalHeight
        })),
        keyEvents: keyStream(renderer),
        shutdown: Effect.sync(() => {
          try {
            renderer.destroy()
          } catch {
            // ignore: renderer may already be destroyed
          }
        })
      })
    })
  )

export const TuiRendererLive = tuiRendererLayer("#11111B")
