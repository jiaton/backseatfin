using Microsoft.AspNetCore.Http;
using Xunit;

namespace Jellyfin.Plugin.BackseatFin.Tests;

public class InjectTests
{
    [Theory]
    [InlineData("/web/", true)]
    [InlineData("/web/index.html", true)]
    [InlineData("/jellyfin/web/index.html", true)]
    [InlineData("/WEB/", true)]
    [InlineData("/web/main.bundle.js", false)]
    [InlineData("/Items/5", false)]
    [InlineData("/", false)]
    public void RecognizesTheWebAppEntry(string path, bool expected)
    {
        Assert.Equal(expected, InjectStartupFilter.IsWebIndex(new PathString(path)));
    }

    [Fact]
    public void WithoutCarHostnamesEveryBrowserGetsTheOptInScript()
    {
        Assert.Equal(
            "<script type=\"module\" src=\"../BackseatFin/inject.js\" data-mode=\"opt-in\"></script>",
            InjectStartupFilter.ScriptTag("jf.example.com", " "));
    }

    [Fact]
    public void CarHostnamesGetTheScriptOtherHostsNone()
    {
        const string hosts = "car.example.com, Car2.example.com";
        Assert.Equal("<script type=\"module\" src=\"../BackseatFin/inject.js\"></script>", InjectStartupFilter.ScriptTag("CAR.example.com", hosts));
        Assert.NotNull(InjectStartupFilter.ScriptTag("car2.example.com", hosts));
        Assert.Null(InjectStartupFilter.ScriptTag("jf.example.com", hosts));
    }

    [Fact]
    public void InjectsBeforeHeadOnce()
    {
        const string tag = "<script src=\"../BackseatFin/inject.js\"></script>";
        var once = InjectStartupFilter.Inject("<html><head><title>x</title></HEAD><body></body></html>", tag);
        Assert.Equal("<html><head><title>x</title>" + tag + "\n</HEAD><body></body></html>", once);
        Assert.Equal(once, InjectStartupFilter.Inject(once, tag));
        Assert.Equal("<p>no head</p>", InjectStartupFilter.Inject("<p>no head</p>", tag));
    }
}
