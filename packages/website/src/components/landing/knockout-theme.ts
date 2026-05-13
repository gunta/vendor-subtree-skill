/**
 * Knockout — custom Shiki theme matching the brand's syntax tokens.
 * The same colors that the terminal-demo uses, kept in lockstep here.
 */
export const knockoutShikiTheme = {
  name: "knockout",
  type: "dark",
  colors: {
    "editor.background": "#08080f",
    "editor.foreground": "#ece8d8"
  },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#6a6f7a", fontStyle: "italic" } },
    { scope: ["string", "string.quoted", "constant.character.escape"], settings: { foreground: "#a5e8b4" } },
    { scope: ["constant.numeric", "constant.language.boolean", "constant.language.null"], settings: { foreground: "#fcd07f" } },
    { scope: ["keyword", "keyword.control", "keyword.operator", "storage.type", "storage.modifier"], settings: { foreground: "#c4a8fa" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#7ad9f0" } },
    { scope: ["variable", "variable.parameter", "variable.other"], settings: { foreground: "#ece8d8" } },
    { scope: ["entity.name.type", "entity.name.class", "support.class", "support.type", "entity.other.inherited-class"], settings: { foreground: "#ff79a6" } },
    { scope: ["entity.name.tag"], settings: { foreground: "#7ad9f0" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#c4a8fa" } },
    { scope: ["punctuation", "meta.brace", "meta.delimiter"], settings: { foreground: "#9da0a8" } },
    { scope: ["meta.object-literal.key", "support.type.property-name", "variable.object.property"], settings: { foreground: "#ece8d8" } },
    { scope: ["constant.language"], settings: { foreground: "#ff79a6" } },
    { scope: ["invalid", "invalid.illegal"], settings: { foreground: "#ff3c79" } }
  ]
} as const
