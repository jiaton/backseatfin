using System;
using System.Collections.Generic;
using Jellyfin.Plugin.BackseatFin.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.BackseatFin;

/// <summary>
/// BackseatFin: Jellyfin in a car's browser, even while the car is moving. The plugin
/// serves the car player at /BackseatFin/ and adds its hand-off script to Jellyfin's
/// web app; pressing Play there then opens the player, which draws Jellyfin's own HLS
/// transcode on a canvas (cars block &lt;video&gt; while driving, not &lt;canvas&gt;).
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "BackseatFin";

    public override string Description => "Watch Jellyfin in the car's browser, even while the car is moving.";

    public override Guid Id => Guid.Parse("1f31e26e-b3ee-4e18-b404-f4a0800fbd9f");

    public IEnumerable<PluginPageInfo> GetPages()
    {
        yield return new PluginPageInfo
        {
            Name = Name,
            EmbeddedResourcePath = "config.html",
        };
    }
}
