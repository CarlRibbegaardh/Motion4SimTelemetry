using System.Diagnostics;

const string listenUrl = "http://127.0.0.1:5188";
var webRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
var openBrowser = !args.Contains("--no-open", StringComparer.OrdinalIgnoreCase);

if (!Directory.Exists(webRoot))
{
    Console.Error.WriteLine($"Dashboard files were not found at: {webRoot}");
    Console.Error.WriteLine("Run build-windows.cmd to create a distributable package.");
    return 1;
}

var builder = WebApplication.CreateSlimBuilder(args);
builder.WebHost.UseUrls(listenUrl);

var app = builder.Build();

app.Run(async context =>
{
    var requestPath = Uri.UnescapeDataString(context.Request.Path.Value ?? "/");
    var relativePath = requestPath == "/"
        ? "index.html"
        : requestPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
    var requestedFile = Path.GetFullPath(Path.Combine(webRoot, relativePath));
    var rootPath = Path.GetFullPath(webRoot) + Path.DirectorySeparatorChar;

    if (!requestedFile.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase))
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        return;
    }

    if (!File.Exists(requestedFile))
    {
        requestedFile = Path.Combine(webRoot, "index.html");
    }

    if (!File.Exists(requestedFile))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    context.Response.ContentType = GetContentType(requestedFile);
    context.Response.Headers.CacheControl =
        Path.GetFileName(requestedFile).Equals("index.html", StringComparison.OrdinalIgnoreCase)
            ? "no-cache"
            : "public, max-age=31536000, immutable";

    await using var file = File.OpenRead(requestedFile);
    context.Response.ContentLength = file.Length;
    await file.CopyToAsync(context.Response.Body);
});

await app.StartAsync();

Console.WriteLine($"Motion4Sim Telemetry is running at {listenUrl}");
Console.WriteLine("Close this window or press Ctrl+C to stop.");

if (openBrowser)
{
    try
    {
        Process.Start(new ProcessStartInfo(listenUrl) { UseShellExecute = true });
    }
    catch (Exception exception)
    {
        Console.WriteLine($"Open {listenUrl} in a browser. ({exception.Message})");
    }
}

await app.WaitForShutdownAsync();
return 0;

static string GetContentType(string path) =>
    Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".css" => "text/css; charset=utf-8",
        ".html" => "text/html; charset=utf-8",
        ".ico" => "image/x-icon",
        ".jpeg" or ".jpg" => "image/jpeg",
        ".js" => "text/javascript; charset=utf-8",
        ".json" => "application/json; charset=utf-8",
        ".png" => "image/png",
        ".svg" => "image/svg+xml",
        ".webp" => "image/webp",
        ".woff" => "font/woff",
        ".woff2" => "font/woff2",
        _ => "application/octet-stream",
    };
