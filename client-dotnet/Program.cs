using System.Drawing;
using System.IO;
using System.IO.Pipes;
using System.Security;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Parlz;

internal static class Program
{
    private const string DefaultServer = "https://chat.parlz.com";
    private const string MutexName = "ParlzShellSingle";
    internal const string PipeName = "ParlzShellPz";

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        var server = ResolveServer(args);
        var link = ResolvePz(args);
        using var single = new Mutex(true, MutexName, out var first);
        if (!first)
        {
            HandOff(link);
            return;
        }
        var form = new MainForm(server, link);
        form.RegisterProtocol();
        Application.Run(form);
    }

    private static string ResolvePz(string[] args)
    {
        foreach (var argument in args)
        {
            var value = argument.Trim();
            if (value.StartsWith("pz:", StringComparison.OrdinalIgnoreCase))
            {
                return value;
            }
        }

        return "";
    }

    private static void HandOff(string link)
    {
        if (link.Length == 0)
        {
            return;
        }

        try
        {
            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
            client.Connect(1500);
            using var writer = new StreamWriter(client);
            writer.Write(link);
            writer.Flush();
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    private static string ResolveServer(string[] args)
    {
        foreach (var argument in args)
        {
            var value = argument.Trim();
            if (value.StartsWith("--server=", StringComparison.OrdinalIgnoreCase))
            {
                var trimmed = value[9..].Trim();
                if (trimmed.Length > 0)
                {
                    return trimmed;
                }
            }
            if (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                value.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                return value;
            }
        }

        var config = Path.Combine(AppContext.BaseDirectory, "parlz.conf");
        if (File.Exists(config))
        {
            foreach (var line in File.ReadAllLines(config))
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith("server=", StringComparison.OrdinalIgnoreCase))
                {
                    var value = trimmed[7..].Trim();
                    if (value.Length > 0)
                    {
                        return value;
                    }
                }
            }
        }

        return DefaultServer;
    }
}

internal sealed class MainForm : Form
{
    private readonly WebView2 view = new();
    private string server;
    private string pendingLink;
    private CoreWebView2Environment? environment;

    public MainForm(string server, string link)
    {
        this.server = server;
        pendingLink = link;
        Text = "Parlz";
        ClientSize = new Size(1180, 780);
        MinimumSize = new Size(880, 620);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(238, 252, 244);
        view.Dock = DockStyle.Fill;
        Controls.Add(view);

        KeyPreview = true;
        KeyDown += (_, keys) =>
        {
            if (keys.KeyCode == Keys.F5)
            {
                view.Reload();
            }
            else if (keys.KeyCode == Keys.F2)
            {
                PromptServer();
            }
        };
        Load += async (_, _) => await StartAsync();
    }

    private void PromptServer()
    {
        using var dialog = new Form
        {
            Text = "切换服务器（F2）",
            ClientSize = new Size(452, 116),
            FormBorderStyle = FormBorderStyle.FixedDialog,
            StartPosition = FormStartPosition.CenterParent,
            MaximizeBox = false,
            MinimizeBox = false,
            BackColor = Color.FromArgb(238, 252, 244),
        };
        var box = new TextBox { Left = 14, Top = 22, Width = 424, Text = server };
        var save = new Button { Text = "保存并刷新", Left = 312, Top = 66, Width = 126, DialogResult = DialogResult.OK };
        var cancel = new Button { Text = "取消", Left = 226, Top = 66, Width = 80, DialogResult = DialogResult.Cancel };
        dialog.Controls.Add(box);
        dialog.Controls.Add(save);
        dialog.Controls.Add(cancel);
        dialog.AcceptButton = save;
        dialog.CancelButton = cancel;

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var next = box.Text.Trim();
        if (!next.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !next.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            MessageBox.Show(this, "地址要以 http:// 或 https:// 开头", "Parlz", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            File.WriteAllText(Path.Combine(AppContext.BaseDirectory, "parlz.conf"), "server=" + next + Environment.NewLine);
        }
        catch (IOException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }

        server = next;
        view.CoreWebView2?.Navigate(server);
    }

    private async Task StartAsync()
    {
        var dataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Parlz",
            "WebView2");
        Directory.CreateDirectory(dataFolder);

        environment = await CoreWebView2Environment.CreateAsync(null, dataFolder);
        await view.EnsureCoreWebView2Async(environment);
        Prepare(view);
        view.CoreWebView2.Navigate(server);
    }

    private void Prepare(WebView2 target)
    {
        if (target.CoreWebView2 is null)
        {
            return;
        }
        target.CoreWebView2.Settings.AreDevToolsEnabled = false;
        target.CoreWebView2.Settings.IsStatusBarEnabled = false;
        target.CoreWebView2.NewWindowRequested += (_, request) =>
        {
            request.Handled = true;
            OpenPopup(request.Uri);
        };
        target.CoreWebView2.NavigationStarting += (_, request) =>
        {
            if (request.Uri.StartsWith("pz:", StringComparison.OrdinalIgnoreCase))
            {
                request.Cancel = true;
                RunLink(request.Uri);
            }
        };
        target.CoreWebView2.NavigationCompleted += (_, _) =>
        {
            if (pendingLink.Length > 0)
            {
                RunLink(pendingLink);
                pendingLink = "";
            }
        };
        ListenForLinks();
    }

    public void RegisterProtocol()
    {
        try
        {
            using var root = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Classes\pz");
            root.SetValue(string.Empty, "URL:Parlz Protocol");
            root.SetValue("URL Protocol", string.Empty);
            using var command = root.CreateSubKey(@"shell\open\command");
            command.SetValue(string.Empty, "\"" + Environment.ProcessPath + "\" \"%1\"");
        }
        catch (SecurityException)
        {
        }
        catch (UnauthorizedAccessException)
        {
        }
    }

    private void RunLink(string link)
    {
        if (view.CoreWebView2 is null || link.Length == 0)
        {
            return;
        }

        _ = view.CoreWebView2.ExecuteScriptAsync("window.ParlzPz && window.ParlzPz(" + Json(link) + ");");
    }

    private static string Json(string value)
    {
        var builder = new StringBuilder("\"");
        foreach (var character in value)
        {
            switch (character)
            {
                case '"': builder.Append("\\\""); break;
                case '\\': builder.Append("\\\\"); break;
                case '\n': builder.Append("\\n"); break;
                case '\r': builder.Append("\\r"); break;
                case '<': builder.Append("\\u003c"); break;
                case '>': builder.Append("\\u003e"); break;
                default:
                    if (character < 0x20)
                    {
                        builder.Append("\\u").Append(((int)character).ToString("x4"));
                    }
                    else
                    {
                        builder.Append(character);
                    }

                    break;
            }
        }

        return builder.Append('"').ToString();
    }

    private void ListenForLinks()
    {
        _ = Task.Run(async () =>
        {
            while (!Disposing && !IsDisposed)
            {
                try
                {
                    using var server = new NamedPipeServerStream(Program.PipeName, PipeDirection.In, 1);
                    await server.WaitForConnectionAsync();
                    using var reader = new StreamReader(server);
                    var link = await reader.ReadToEndAsync();
                    if (link.Length > 0)
                    {
                        BeginInvoke(() => RunLink(link));
                    }
                }
                catch (IOException)
                {
                    await Task.Delay(500);
                }
                catch (ObjectDisposedException)
                {
                    return;
                }
                catch (InvalidOperationException)
                {
                    return;
                }
            }
        });
    }

    private async void OpenPopup(string uri)
    {
        var popup = new Form
        {
            Text = "聊天记录",
            ClientSize = new Size(760, 620),
            MinimumSize = new Size(420, 360),
            StartPosition = FormStartPosition.CenterScreen,
            BackColor = Color.FromArgb(238, 252, 244),
            ShowIcon = false,
        };
        var child = new WebView2 { Dock = DockStyle.Fill };
        popup.Controls.Add(child);
        popup.FormClosed += (_, _) => child.Dispose();
        popup.Show(this);

        if (environment is null)
        {
            return;
        }
        await child.EnsureCoreWebView2Async(environment);
        Prepare(child);
        child.CoreWebView2.Navigate(uri);
    }
}
