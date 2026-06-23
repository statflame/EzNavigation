# EzNavigation

A Vencord plugin for easier navigation on big servers. Adds a button to the server header that opens a searchable directory of the server's Guilds (or categories), each showing a jump to that Guild's general channel.
Although it was designed to be used only on Dupers University, it might come in handy for other server with a huge category count.

### Keybind: (hold) Left Alt

## Screenshots
<img width="1234" height="820" alt="image" src="https://github.com/user-attachments/assets/8b597333-de3b-46f1-8d82-df45d751be92" />



## How do I Install it?

1. Set up a [Vencord](https://vencord.dev) source checkout.
2. Copy the `ezNavigation/` folder into `src/userplugins/ezNavigation/`.
3. Build and inject:
   ```sh
   pnpm build
   pnpm inject
   ```
4. Restart Discord, then enable **EzNavigation** in Settings → (Vencord) Plugins.
5. Set your server ID in the plugin's `enabledGuildIds` setting.
