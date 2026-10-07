using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.BackseatFin.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Hostnames (comma or space separated) that serve Jellyfin to the car only, e.g.
    /// "car.example.com". On those, every browser gets the car player. When empty, the
    /// player is added everywhere but only acts in browsers switched to car mode at
    /// /BackseatFin/car, so phones and computers keep Jellyfin's own player.
    /// </summary>
    public string CarHostnames { get; set; } = string.Empty;
}
