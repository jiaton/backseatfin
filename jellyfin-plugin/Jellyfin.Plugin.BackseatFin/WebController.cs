using System;
using System.IO;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.BackseatFin;

/// <summary>
/// Serves the car player's files at /BackseatFin/: play (the player), car (the car-mode
/// switch), inject.js and assets/*. Static files only, public like Jellyfin's own web
/// app: the player signs in with the viewer's Jellyfin session from the browser.
/// </summary>
[ApiController]
[AllowAnonymous]
[Route("BackseatFin")]
public class WebController : ControllerBase
{
    private static readonly Assembly Self = typeof(WebController).Assembly;

    [HttpGet("{**path}")]
    [ApiExplorerSettings(IgnoreApi = true)]
    public ActionResult Get(string path)
    {
        var file = path switch
        {
            "play" or "play.html" => "play.html",
            "car" or "car.html" => "car.html",
            _ => path,
        };
        // Embedded resources only: no path ever reaches the file system.
        var stream = Self.GetManifestResourceStream("web/" + file);
        if (stream is null)
        {
            return NotFound();
        }

        if (file == "car.html")
        {
            // The car-mode page says how this address gets the car player: switched per
            // browser, or by the car hostnames set in the plugin's settings.
            var mode = InjectStartupFilter.HostMode(Request.Host.Host, Plugin.Instance?.Configuration.CarHostnames ?? string.Empty);
            using var reader = new StreamReader(stream);
            var html = InjectStartupFilter.Inject(reader.ReadToEnd(), $"<meta name=\"backseatfin-host\" content=\"{mode}\">");
            Response.Headers.CacheControl = "no-cache";
            return Content(html, ContentType(file));
        }

        var hashed = file.StartsWith("assets/", StringComparison.Ordinal);
        // Hashed build output never changes under the same name; the pages and
        // inject.js must update as soon as the plugin does.
        Response.Headers.CacheControl = hashed ? "public, max-age=31536000, immutable" : "no-cache";
        return File(stream, ContentType(file));
    }

    private static string ContentType(string file) => Path.GetExtension(file) switch
    {
        ".html" => "text/html; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".svg" => "image/svg+xml",
        ".woff2" => "font/woff2",
        _ => "application/octet-stream",
    };
}
