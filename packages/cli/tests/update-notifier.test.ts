import { describe, expect, test } from "bun:test"

import { notifyIfCliOutdated } from "../src/app/update-notifier.ts"

describe("CLI update notifier", () => {
  test("starts the npm update check with a deferred upgrade banner", () => {
    const calls: Array<{
      readonly options: unknown
      readonly notifyOptions: unknown
    }> = []

    notifyIfCliOutdated({
      currentVersion: "0.3.2",
      updateNotifier: (options) => ({
        notify: (notifyOptions) => {
          calls.push({ options, notifyOptions })
        }
      })
    })

    expect(calls).toEqual([
      {
        options: {
          pkg: {
            name: "@ingraft/cli",
            version: "0.3.2"
          },
          updateCheckInterval: 86_400_000
        },
        notifyOptions: {
          defer: true,
          message:
            "Update available: {packageName} {currentVersion} -> {latestVersion}\nRun npm install -g {packageName}@latest to upgrade."
        }
      }
    ])
  })

  test("does not let notifier setup failures interrupt CLI startup", () => {
    expect(() =>
      notifyIfCliOutdated({
        currentVersion: "0.3.2",
        updateNotifier: () => {
          throw new Error("config store unavailable")
        }
      })
    ).not.toThrow()
  })
})
