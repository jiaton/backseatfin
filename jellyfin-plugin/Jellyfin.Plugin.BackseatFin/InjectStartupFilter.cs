using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.BackseatFin;

/// <summary>
/// Adds the hand-off script to Jellyfin's web app: index.html gets
/// &lt;script type="module" src="../BackseatFin/inject.js"&gt; before &lt;/head&gt;.
/// Nothing else about Jellyfin's pages or API changes. Jellyfin's web files are often
/// read-only (the official image), so this happens per response, not on disk.
/// </summary>
public class InjectStartupFilter : IStartupFilter
{
    public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
    {
        return app =>
        {
            app.Use(InjectAsync);
            next(app);
        };
    }

    /// <summary>The web app's entry document: /web/ or /web/index.html (under any base URL).</summary>
    public static bool IsWebIndex(PathString path)
    {
        var p = path.Value ?? string.Empty;
        return p.EndsWith("/web/", StringComparison.OrdinalIgnoreCase)
            || p.EndsWith("/web/index.html", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// How this host gets the car player: "opt-in" (no car hostnames set: every browser
    /// gets the script, only those switched to car mode use it), "car" (a car hostname:
    /// every browser uses it) or "none" (another host while car hostnames are set).
    /// </summary>
    public static string HostMode(string host, string carHostnames)
    {
        var hosts = carHostnames
            .Split(new[] { ',', ' ', ';', '\n' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(h => h.ToLowerInvariant())
            .ToArray();
        if (hosts.Length == 0)
        {
            return "opt-in";
        }

        return hosts.Contains(host.ToLowerInvariant()) ? "car" : "none";
    }

    /// <summary>The script tag for this request, or null when this host doesn't get one.</summary>
    public static string? ScriptTag(string host, string carHostnames) => HostMode(host, carHostnames) switch
    {
        "opt-in" => "<script type=\"module\" src=\"../BackseatFin/inject.js\" data-mode=\"opt-in\"></script>",
        "car" => "<script type=\"module\" src=\"../BackseatFin/inject.js\"></script>",
        _ => null,
    };

    public static string Inject(string html, string tag)
    {
        if (html.Contains("/BackseatFin/inject.js", StringComparison.Ordinal))
        {
            return html;
        }

        var head = html.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        return head < 0 ? html : html.Insert(head, tag + "\n");
    }

    private static async Task InjectAsync(HttpContext context, Func<Task> next)
    {
        var tag = HttpMethods.IsGet(context.Request.Method) && IsWebIndex(context.Request.Path)
            ? ScriptTag(context.Request.Host.Host, Plugin.Instance?.Configuration.CarHostnames ?? string.Empty)
            : null;
        if (tag is null)
        {
            await next().ConfigureAwait(false);
            return;
        }

        // A plain, complete 200 to rewrite: no compression, no 304 from a cached copy.
        context.Request.Headers.Remove(HeaderNames.AcceptEncoding);
        context.Request.Headers.Remove(HeaderNames.IfNoneMatch);
        context.Request.Headers.Remove(HeaderNames.IfModifiedSince);

        var original = context.Response.Body;
        using var buffer = new MemoryStream();
        context.Response.Body = buffer;
        try
        {
            await next().ConfigureAwait(false);
        }
        finally
        {
            context.Response.Body = original;
        }

        buffer.Position = 0;
        var isHtml = context.Response.ContentType?.StartsWith("text/html", StringComparison.OrdinalIgnoreCase) == true;
        if (context.Response.StatusCode != StatusCodes.Status200OK || !isHtml)
        {
            await buffer.CopyToAsync(original, context.RequestAborted).ConfigureAwait(false);
            return;
        }

        var html = Encoding.UTF8.GetString(buffer.ToArray());
        var bytes = Encoding.UTF8.GetBytes(Inject(html, tag));
        context.Response.Headers.Remove(HeaderNames.ETag);
        context.Response.Headers.Remove(HeaderNames.LastModified);
        context.Response.Headers.CacheControl = "no-cache";
        context.Response.ContentLength = bytes.Length;
        await original.WriteAsync(bytes, context.RequestAborted).ConfigureAwait(false);
    }
}
