using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.BackseatFin;

public class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
    {
        // Runs before Jellyfin builds its request pipeline, so the filter's middleware
        // sits in front of the web app's static files.
        serviceCollection.AddTransient<IStartupFilter, InjectStartupFilter>();
    }
}
