{
  description = "Vendor upstream source repositories into agent-ready projects.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-darwin"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        rec {
          ingraft = pkgs.callPackage ./nix/package.nix { };
          default = ingraft;
        }
      );

      apps = forAllSystems (system: {
        ingraft = {
          type = "app";
          program = "${self.packages.${system}.ingraft}/bin/ingraft";
        };
        default = self.apps.${system}.ingraft;
      });

      overlays.default = final: _prev: {
        ingraft = final.callPackage ./nix/package.nix { };
      };
    };
}
