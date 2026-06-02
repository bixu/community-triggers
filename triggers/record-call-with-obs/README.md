# Record call with OBS

[OBS](https://obsproject.com/) is a solid way to record the audio and video of your Tuple calls. This guide gets you set up to record your calls automatically.

### Install OBS
You can grab OBS for your OS [here](https://obsproject.com/download).

### Add Sources in OBS
To have OBS capture your screen, add three "sources" (these are configured via the "Sources" panel in the lower left of the OBS window):

- macOS Screen Capture
- Audio Input Capture
- macOS Audio Capture

### Enable OBS's WebSocket server

You'll also need to start OBS's built-in WebSocket server. Enable it by going to Tools > WebSocket Server Settings, clicking "Enable WebSocket server", and clicking "Apply". You can read more about this functionality [here](https://obsproject.com/kb/remote-control-guide).

You can also set a WebSocket server password if desired. Note that the scripts in this trigger expect the WebSocket server **to not have a password set**. If you choose to set a password, update these trigger scripts accordingly.

### Install Deno
These scripts run via [deno](https://deno.com/). The shebang resolves `deno` via `env`, so make sure `deno` is on your `PATH` (e.g. `brew install deno` works on both Intel and Apple Silicon Macs).