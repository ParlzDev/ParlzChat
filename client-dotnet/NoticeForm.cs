using System.Drawing;
using System.Drawing.Drawing2D;
using System.Net.Http;
using System.Windows.Forms;

namespace Parlz;

internal sealed class NoticeForm : Form
{
    private static readonly List<NoticeForm> Open = new();
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(6) };

    private readonly System.Windows.Forms.Timer life = new();
    private readonly int chatId;
    private readonly Action<int> open;
    private readonly string title;
    private readonly string body;
    private readonly int count;
    private readonly string avatarUrl;
    private Image? avatar;
    private Rectangle closeBox;
    private bool closing;

    public NoticeForm(string title, string body, int count, int chatId, string avatarUrl, Action<int> open)
    {
        this.title = title;
        this.body = body;
        this.count = count;
        this.chatId = chatId;
        this.avatarUrl = avatarUrl;
        this.open = open;

        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        ClientSize = new Size(348, 106);
        BackColor = Color.FromArgb(22, 36, 28);
        DoubleBuffered = true;
        SetStyle(ControlStyles.ResizeRedraw | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer, true);

        using var path = Rounded(ClientRectangle, 14);
        Region = new Region(path);

        life.Interval = 6000;
        life.Tick += (_, _) => Close();
        life.Start();

        MouseEnter += (_, _) => life.Stop();
        MouseLeave += (_, _) => life.Start();
        MouseClick += OnClick;
        MouseMove += (_, e) =>
        {
            Cursor = closeBox.Contains(e.Location) ? Cursors.Hand : Cursors.Default;
        };
        Shown += (_, _) => Layout();
        FormClosed += (_, _) =>
        {
            Open.Remove(this);
            avatar?.Dispose();
            Layout();
        };
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        if (chatId > 0 || true)
        {
            var handle = Handle;
            _ = Task.Run(async () =>
            {
                try
                {
                    var primary = Screen.PrimaryScreen ?? Screen.AllScreens[0];
                    if (!string.IsNullOrEmpty(avatarUrl))
                    {
                        var bytes = await Http.GetByteArrayAsync(avatarUrl);
                        using var stream = new MemoryStream(bytes);
                        var image = Image.FromStream(stream);
                        BeginInvoke(() =>
                        {
                            avatar = image;
                            Invalidate();
                        });
                    }
                }
                catch (Exception)
                {
                }
            });
        }
    }

    private static GraphicsPath Rounded(Rectangle rect, int radius)
    {
        var path = new GraphicsPath();
        var d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d - 1, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d - 1, rect.Bottom - d - 1, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d - 1, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private void Layout()
    {
        var area = Screen.PrimaryScreen?.WorkingArea ?? Screen.GetWorkingArea(Point.Empty);
        Open.Remove(this);
        Open.Add(this);
        for (var i = 0; i < Open.Count; i += 1)
        {
            var form = Open[Open.Count - 1 - i];
            form.Location = new Point(area.Right - form.Width - 12, area.Bottom - form.Height - 12 - i * (form.Height + 8));
        }
    }

    private void OnClick(object? sender, MouseEventArgs e)
    {
        if (closeBox.Contains(e.Location))
        {
            Close();
            return;
        }
        if (closing)
        {
            return;
        }
        closing = true;
        if (chatId > 0)
        {
            open(chatId);
        }
        Close();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var rect = new Rectangle(0, 0, Width - 1, Height - 1);
        using (var back = new SolidBrush(Color.FromArgb(22, 36, 28)))
        {
            g.FillPath(back, Rounded(rect, 14));
        }
        using (var border = new Pen(Color.FromArgb(46, 74, 58)))
        {
            g.DrawPath(border, Rounded(rect, 14));
        }

        var avatarBox = new Rectangle(14, 20, 66, 66);
        if (avatar != null)
        {
            using var clip = Rounded(avatarBox, 33);
            var saved = g.Clip;
            g.SetClip(clip);
            g.DrawImage(avatar, avatarBox);
            g.Clip = saved;
        }
        else
        {
            using var fill = new SolidBrush(Color.FromArgb(0, 217, 95));
            g.FillPath(fill, Rounded(avatarBox, 33));
            using var font = new Font("Microsoft YaHei UI", 20F, FontStyle.Bold);
            var letter = title.Length > 0 ? title.Substring(0, 1) : "P";
            var size = g.MeasureString(letter, font);
            using var ink = new SolidBrush(Color.FromArgb(6, 32, 18));
            g.DrawString(letter, font, ink, avatarBox.X + (avatarBox.Width - size.Width) / 2f, avatarBox.Y + (avatarBox.Height - size.Height) / 2f);
        }

        var textLeft = avatarBox.Right + 12;
        var textWidth = Width - textLeft - 40;
        using (var titleFont = new Font("Microsoft YaHei UI", 10.5F, FontStyle.Bold))
        using (var bodyFont = new Font("Microsoft YaHei UI", 9F))
        using (var titleInk = new SolidBrush(Color.FromArgb(240, 255, 248)))
        using (var bodyInk = new SolidBrush(Color.FromArgb(150, 190, 168)))
        {
            var titleText = count > 1 ? title + "  (" + count + " 条新消息)" : title;
            g.DrawString(titleText, titleFont, titleInk, new RectangleF(textLeft, 20, textWidth, 24));
            g.DrawString(body, bodyFont, bodyInk, new RectangleF(textLeft, 46, textWidth, 42));
        }

        using (var closeFont = new Font("Microsoft YaHei UI", 9F))
        using (var closeInk = new SolidBrush(Color.FromArgb(120, 160, 140)))
        {
            closeBox = new Rectangle(Width - 30, 10, 20, 20);
            g.DrawString("×", closeFont, closeInk, closeBox.X + 4, closeBox.Y);
        }
    }
}
