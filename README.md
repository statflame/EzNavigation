# discord-ez-navigation

A Vencord userplugin for the Dupers University server. Adds a button to the server header that opens a searchable, sortable directory of the server's Guilds (categories), each showing its member count and a Jump to that Guild's general channel.

## Installation

1. Set up a [Vencord](https://vencord.dev) source checkout.
2. Copy the `ezNavigation/` folder into `src/userplugins/ezNavigation/`.
3. Build and inject:
   ```sh
   pnpm build
   pnpm inject
   ```
4. Restart Discord, then enable **EzNavigation** in Settings → Plugins.
5. Set your server ID in the plugin's `enabledGuildIds` setting.
