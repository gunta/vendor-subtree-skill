import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode
} from "@xmldom/xmldom"
import { Context, Effect, FileSystem, Layer, Path } from "effect"

import { warn } from "../app/log.tsx"
import { RuntimeConfig, type RuntimeConfigShape } from "../app/runtime.ts"
import type { SettingsMergeResult } from "../config/jsonc-settings.ts"
import { VENDOR_DIR } from "../domain/constants.ts"

const VENDOR_SCOPE_NAME = "Vendor"
const VENDOR_SCOPE_COLOR = "Green"
const VENDOR_SCOPE_PATTERN = `file:${VENDOR_DIR}//*`
const DEPENDENCY_VALIDATION_COMPONENT = "DependencyValidationManager"
const SHARED_FILE_COLORS_COMPONENT = "SharedFileColors"
const ELEMENT_NODE = 1
const TEXT_NODE = 3
const VENDOR_SCOPE_XML = [
  `<component name="${DEPENDENCY_VALIDATION_COMPONENT}">`,
  `  <scope name="${VENDOR_SCOPE_NAME}" pattern="${VENDOR_SCOPE_PATTERN}" />`,
  "</component>",
  ""
].join("\n")
const VENDOR_FILE_COLOR = `<fileColor scope="${VENDOR_SCOPE_NAME}" color="${VENDOR_SCOPE_COLOR}" />`
const DEFAULT_FILE_COLORS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<project version="4">',
  '  <component name="SharedFileColors">',
  `    ${VENDOR_FILE_COLOR}`,
  "  </component>",
  "</project>",
  ""
].join("\n")

interface RefreshIntellijSettingsWithParams {
  readonly cwd: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly runtime: RuntimeConfigShape
}

interface WriteMergedFileParams {
  readonly fs: FileSystem.FileSystem
  readonly merge: SettingsMergeResult
  readonly path: Path.Path
  readonly target: string
}

type ParsedXml =
  | {
      readonly _tag: "Valid"
      readonly document: XmlDocument
      readonly root: XmlElement
    }
  | {
      readonly _tag: "Invalid"
      readonly message: string
    }

const warnWithRuntime = (_runtime: RuntimeConfigShape, message: string) => warn(message)

const parseXml = ({
  invalidRootMessage,
  malformedMessage,
  rootName,
  text
}: {
  readonly invalidRootMessage: string
  readonly malformedMessage: string
  readonly rootName: string
  readonly text: string
}): ParsedXml => {
  try {
    const document = new DOMParser({
      onError: (level, message) => {
        if (level !== "warning") throw new Error(message)
      }
    }).parseFromString(text, "application/xml")
    const root = document.documentElement
    if (!root || root.tagName !== rootName) {
      return { _tag: "Invalid", message: invalidRootMessage }
    }
    return { _tag: "Valid", document, root }
  } catch {
    return { _tag: "Invalid", message: malformedMessage }
  }
}

const serializeXml = (document: XmlDocument, malformedMessage: string) => {
  try {
    return {
      _tag: "Updated" as const,
      text: new XMLSerializer().serializeToString(document)
    }
  } catch {
    return { _tag: "Invalid" as const, message: malformedMessage }
  }
}

const childElements = (parent: XmlElement, tagName: string): ReadonlyArray<XmlElement> => {
  const elements: Array<XmlElement> = []
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const node = parent.childNodes.item(index)
    if (node && node.nodeType === ELEMENT_NODE && (node as XmlElement).tagName === tagName) {
      elements.push(node as XmlElement)
    }
  }
  return elements
}

const findComponent = (root: XmlElement, name: string): XmlElement | undefined =>
  childElements(root, "component").find((component) => component.getAttribute("name") === name)

const hasChildElementWithAttribute = (
  parent: XmlElement,
  tagName: string,
  attribute: string,
  value: string
): boolean =>
  childElements(parent, tagName).some((element) => element.getAttribute(attribute) === value)

const trailingWhitespaceChild = (parent: XmlElement): XmlNode | undefined => {
  const last = parent.lastChild
  return last?.nodeType === TEXT_NODE && /^\s*$/.test(last.nodeValue ?? "") ? last : undefined
}

const insertElementBeforeClosingWhitespace = ({
  closingIndent,
  element,
  parent,
  prefixIndent
}: {
  readonly closingIndent: string
  readonly element: XmlElement
  readonly parent: XmlElement
  readonly prefixIndent: string
}) => {
  const document = parent.ownerDocument
  if (!document) return
  const trailing = trailingWhitespaceChild(parent)
  if (trailing) {
    parent.insertBefore(document.createTextNode(prefixIndent), trailing)
    parent.insertBefore(element, trailing)
    return
  }
  parent.appendChild(document.createTextNode(prefixIndent))
  parent.appendChild(element)
  parent.appendChild(document.createTextNode(closingIndent))
}

const createVendorScope = (document: XmlDocument) => {
  const scope = document.createElement("scope")
  scope.setAttribute("name", VENDOR_SCOPE_NAME)
  scope.setAttribute("pattern", VENDOR_SCOPE_PATTERN)
  return scope
}

const createVendorFileColor = (document: XmlDocument) => {
  const fileColor = document.createElement("fileColor")
  fileColor.setAttribute("scope", VENDOR_SCOPE_NAME)
  fileColor.setAttribute("color", VENDOR_SCOPE_COLOR)
  return fileColor
}

const createSharedFileColorsComponent = (document: XmlDocument) => {
  const component = document.createElement("component")
  component.setAttribute("name", SHARED_FILE_COLORS_COMPONENT)
  component.appendChild(document.createTextNode("\n    "))
  component.appendChild(createVendorFileColor(document))
  component.appendChild(document.createTextNode("\n  "))
  return component
}

export const mergeIntellijVendorScopeText = (text = ""): SettingsMergeResult => {
  if (text.trim() === "") return { _tag: "Updated", text: VENDOR_SCOPE_XML }
  const parsed = parseXml({
    invalidRootMessage: ".idea/scopes/Vendor.xml must contain a <component> root.",
    malformedMessage: ".idea/scopes/Vendor.xml is not well-formed XML.",
    rootName: "component",
    text
  })
  if (parsed._tag === "Invalid") return parsed
  if (parsed.root.getAttribute("name") !== DEPENDENCY_VALIDATION_COMPONENT) {
    return {
      _tag: "Invalid",
      message: ".idea/scopes/Vendor.xml must contain a DependencyValidationManager component."
    }
  }
  if (
    childElements(parsed.root, "scope").some(
      (scope) =>
        scope.getAttribute("name") === VENDOR_SCOPE_NAME &&
        scope.getAttribute("pattern") === VENDOR_SCOPE_PATTERN
    )
  ) {
    return { _tag: "Unchanged" }
  }
  insertElementBeforeClosingWhitespace({
    closingIndent: "\n",
    element: createVendorScope(parsed.document),
    parent: parsed.root,
    prefixIndent: "\n  "
  })
  return serializeXml(parsed.document, ".idea/scopes/Vendor.xml is not well-formed XML.")
}

export const mergeIntellijFileColorsText = (text = ""): SettingsMergeResult => {
  if (text.trim() === "") {
    return { _tag: "Updated", text: DEFAULT_FILE_COLORS_XML }
  }
  const parsed = parseXml({
    invalidRootMessage: ".idea/fileColors.xml must contain a <project> root.",
    malformedMessage: ".idea/fileColors.xml is not well-formed XML.",
    rootName: "project",
    text
  })
  if (parsed._tag === "Invalid") return parsed

  const component = findComponent(parsed.root, SHARED_FILE_COLORS_COMPONENT)
  if (
    component &&
    hasChildElementWithAttribute(component, "fileColor", "scope", VENDOR_SCOPE_NAME)
  ) {
    return { _tag: "Unchanged" }
  }

  if (component) {
    insertElementBeforeClosingWhitespace({
      closingIndent: "\n  ",
      element: createVendorFileColor(parsed.document),
      parent: component,
      prefixIndent: "\n    "
    })
  } else {
    insertElementBeforeClosingWhitespace({
      closingIndent: "\n",
      element: createSharedFileColorsComponent(parsed.document),
      parent: parsed.root,
      prefixIndent: "\n  "
    })
  }
  return serializeXml(parsed.document, ".idea/fileColors.xml is not well-formed XML.")
}

const readExisting = (fs: FileSystem.FileSystem, target: string): Effect.Effect<string, unknown> =>
  fs
    .exists(target)
    .pipe(Effect.flatMap((exists) => (exists ? fs.readFileString(target) : Effect.succeed(""))))

const writeMergedFile = ({ fs, merge, path, target }: WriteMergedFileParams) => {
  switch (merge._tag) {
    case "Invalid":
    case "Unchanged":
      return Effect.succeed([])
    case "Updated":
      return fs
        .makeDirectory(path.dirname(target), { recursive: true })
        .pipe(
          Effect.ignore,
          Effect.andThen(
            fs.writeFileString(target, merge.text.endsWith("\n") ? merge.text : `${merge.text}\n`)
          ),
          Effect.as([target])
        )
  }
}

const refreshIntellijSettingsWith = ({
  cwd,
  fs,
  path,
  runtime
}: RefreshIntellijSettingsWithParams) =>
  Effect.gen(function* () {
    const ideaDir = path.resolve(cwd, ".idea")
    if (!(yield* fs.exists(ideaDir))) return []

    const scopeTarget = path.resolve(cwd, ".idea/scopes/Vendor.xml")
    const scopeCurrent = yield* readExisting(fs, scopeTarget)
    const scopeWritten = yield* writeMergedFile({
      fs,
      merge: mergeIntellijVendorScopeText(scopeCurrent),
      path,
      target: scopeTarget
    })

    const fileColorsTarget = path.resolve(cwd, ".idea/fileColors.xml")
    const fileColorsCurrent = yield* readExisting(fs, fileColorsTarget)
    const fileColorsMerge = mergeIntellijFileColorsText(fileColorsCurrent)
    if (fileColorsMerge._tag === "Invalid") {
      yield* warnWithRuntime(
        runtime,
        `Could not update .idea/fileColors.xml (${fileColorsMerge.message}); skipping update.`
      )
      return scopeWritten
    }
    const fileColorsWritten = yield* writeMergedFile({
      fs,
      merge: fileColorsMerge,
      path,
      target: fileColorsTarget
    })

    return [...scopeWritten, ...fileColorsWritten]
  })

export interface IntellijSettingsShape {
  readonly refresh: (cwd: string) => Effect.Effect<ReadonlyArray<string>, unknown>
}

export class IntellijSettings extends Context.Service<IntellijSettings, IntellijSettingsShape>()(
  "ingraft/IntellijSettings"
) {}

export const IntellijSettingsLive = Layer.effect(
  IntellijSettings,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const runtime = yield* RuntimeConfig
    return {
      refresh: (cwd: string) => refreshIntellijSettingsWith({ cwd, fs, path, runtime })
    }
  })
)
