{
  bun,
  buildNpmPackage,
  git,
  importNpmLock,
  lib,
  nodejs_24,
}:

let
  packageJson = lib.importJSON ../packages/cli/package.json;
in
buildNpmPackage {
  pname = "ingraft";
  version = packageJson.version;

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../tsconfig.base.json
      ../packages/cli/LICENSE
      ../packages/cli/README.md
      ../packages/cli/bin
      ../packages/cli/man
      ../packages/cli/package-lock.json
      ../packages/cli/package.json
      ../packages/cli/src
      ../packages/cli/tsconfig.build.json
      ../packages/cli/tsconfig.json
    ];
  };

  postUnpack = ''
    sourceRoot="$sourceRoot/packages/cli"
  '';

  npmDeps = importNpmLock {
    npmRoot = ../packages/cli;
  };
  npmConfigHook = importNpmLock.npmConfigHook;
  npmFlags = [ "--legacy-peer-deps" ];
  npmPackFlags = [ "--ignore-scripts" ];
  npmPruneFlags = [ "--legacy-peer-deps" ];

  nodejs = nodejs_24;

  makeWrapperArgs = [
    "--prefix"
    "PATH"
    ":"
    (lib.makeBinPath [
      bun
      git
    ])
  ];

  postInstall = ''
    install -Dm644 man/ingraft.1 "$out/share/man/man1/ingraft.1"
  '';

  meta = {
    description = packageJson.description;
    homepage = packageJson.homepage;
    license = lib.licenses.mit;
    mainProgram = "ingraft";
    platforms = lib.platforms.darwin ++ lib.platforms.linux;
  };
}
