using System.Drawing;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Parlz;

internal static class Program
{
    private const string DefaultServer = "https://chat.parlz.com";

    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm(ResolveServer(args)));
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
    private CoreWebView2Environment? environment;

    public MainForm(string server)
    {
        this.server = server;
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
