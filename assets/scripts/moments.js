import { state } from './state.js';
import { $, esc, avatarHtml, toast, paintPage, uploadUrl, fmtMsgTime, armConfirm } from './util.js';
import { apiGet, apiPost } from './api.js';
import { icon } from './icons.js';

const MAX_IMAGES = 9;

let feed = [];
let picked = [];
let busy = false;

function imageCountClass(count) {
  return 'post-imgs count-' + Math.min(count, MAX_IMAGES);
}

function pickHtml() {
  return picked.map((pick, index) =>
    '<span class="moment-pick"><img src="' + esc(pick.url) + '" alt="">' +
    '<button type="button" class="moment-pick-rm" data-pick-rm="' + index + '" title="移除" aria-label="移除">✕</button></span>').join('');
}

function paintPicks() {
  const host = $('#moment-picks');
  if (host !== null) {
    host.innerHTML = pickHtml();
  }
  const count = $('#moment-count');
  if (count !== null) {
    count.textContent = picked.length + '/' + MAX_IMAGES;
  }
}

function clearPicks() {
  picked.forEach((pick) => URL.revokeObjectURL(pick.url));
  picked = [];
  paintPicks();
}

function addFiles(files) {
  for (const file of files) {
    if (picked.length >= MAX_IMAGES) {
      toast('最多选 ' + MAX_IMAGES + ' 张图片', true);
      break;
    }
    if (!String(file.type).startsWith('image/')) {
      continue;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('图片不能超过 8MB', true);
      continue;
    }
    picked.push({ file, url: URL.createObjectURL(file) });
  }
  paintPicks();
}

function cardHtml(post) {
  const images = post.images.length === 0 ? '' :
    '<div class="' + imageCountClass(post.images.length) + '">' +
    post.images.map((file) =>
      '<img class="post-img" src="' + esc(uploadUrl(file)) + '" alt="配图" loading="lazy">').join('') +
    '</div>';

  const likes = post.likes.length === 0 ? '' :
    '<div class="post-likes">' + icon('heart') +
    '<span class="post-like-names">' + post.likes.map((one) => esc(one.nickname)).join('、') + ' 赞了</span></div>';

  const comments = post.comments.length === 0 ? '' :
    '<div class="post-comments">' +
    post.comments.map((comment) =>
      '<div class="post-comment"><span class="post-comment-who"' + (comment.user.id !== state.user?.id ? ' data-user="' + comment.user.id + '"' : '') + '>' +
      esc(comment.user.nickname) + '：</span>' + esc(comment.body) + '</div>').join('') +
    '</div>';

  return '<article class="post-card" data-post="' + post.id + '">' +
    '<div class="post-head">' + avatarHtml(post.user, '', false, true) +
      '<div class="post-who"><div class="post-name">' + esc(post.user.nickname) + '</div>' +
      '<div class="post-time">' + esc(fmtMsgTime(post.created_at)) + '</div></div>' +
      (post.mine ? '<button type="button" class="btn btn-sm post-del" data-del="' + post.id + '" data-label="删除">删除</button>' : '') +
    '</div>' +
    (post.body === '' ? '' : '<div class="post-text">' + esc(post.body) + '</div>') +
    images + likes + comments +
    '<div class="post-actions">' +
      '<button type="button" class="post-act like-act' + (post.liked ? ' is-liked' : '') + '" data-like="' + post.id + '">' +
        icon('heart') + '<span>' + (post.likeCount === 0 ? '赞' : String(post.likeCount)) + '</span></button>' +
      '<button type="button" class="post-act" data-comment="' + post.id + '">' + icon('chat') + '<span>评论</span></button>' +
    '</div>' +
    '<form class="comment-form is-hidden" data-comment-form="' + post.id + '">' +
      '<input class="input comment-input" maxlength="2000" placeholder="评论…" autocomplete="off">' +
      '<button type="submit" class="btn btn-sm btn-primary">发送</button>' +
    '</form>' +
  '</article>';
}

function feedHtml() {
  if (feed.length === 0) {
    return '<p class="empty-note">还没有动态，来发第一条吧</p>';
  }
  return feed.map(cardHtml).join('');
}

function paintFeed() {
  const host = $('#moment-feed');
  if (host !== null) {
    host.innerHTML = feedHtml();
  }
}

function paintCard(postId) {
  const card = document.querySelector('.post-card[data-post="' + postId + '"]');
  const post = feed.find((one) => one.id === postId);
  if (card === null || post === undefined) {
    paintFeed();
    return;
  }
  card.outerHTML = cardHtml(post);
}

async function load() {
  const res = await apiGet('api/moments.php');
  feed = (res.posts ?? []).map((post) => ({ ...post, likeCount: post.likes.length }));
  paintFeed();
}

async function publish() {
  if (busy) {
    return;
  }
  const textNode = $('#moment-text');
  const body = textNode === null ? '' : textNode.value.trim();
  if (body === '' && picked.length === 0) {
    toast('写点什么或选张图片吧', true);
    return;
  }
  busy = true;
  const button = $('#moment-publish');
  if (button !== null) {
    button.disabled = true;
  }
  try {
    const files = [];
    const { uploadFile } = await import('./upload.js');
    for (const pick of picked) {
      const form = new FormData();
      form.append('image', pick.file);
      const res = await uploadFile('api/uploads.php', form, pick.file.name);
      files.push(res.file);
    }
    await apiPost('api/moments.php', { action: 'add', body, images: files });
    if (textNode !== null) {
      textNode.value = '';
    }
    clearPicks();
    await load();
    toast('已发布');
  } catch (error) {
    toast(error.message, true);
  } finally {
    busy = false;
    if (button !== null) {
      button.disabled = false;
    }
  }
}

async function toggleLike(postId) {
  const post = feed.find((one) => one.id === postId);
  if (post === undefined) {
    return;
  }
  const on = !post.liked;
  try {
    await apiPost('api/moments.php', { action: 'like', id: postId, on });
    post.liked = on;
    const me = state.user ?? { id: 0, nickname: '', avatar: '' };
    if (on) {
      post.likes.push({ id: me.id, nickname: me.nickname, avatar: me.avatar });
    } else {
      post.likes = post.likes.filter((one) => one.id !== me.id);
    }
    post.likeCount = post.likes.length;
    paintCard(postId);
  } catch (error) {
    toast(error.message, true);
  }
}

async function submitComment(form, postId) {
  const input = form.querySelector('.comment-input');
  const body = input === null ? '' : input.value.trim();
  if (body === '') {
    return;
  }
  try {
    const res = await apiPost('api/moments.php', { action: 'comment', id: postId, body });
    const post = feed.find((one) => one.id === postId);
    if (post !== undefined && res.comment) {
      post.comments.push(res.comment);
    }
    paintCard(postId);
    const card = document.querySelector('.post-card[data-post="' + postId + '"]');
    const nextForm = card === null ? null : card.querySelector('.comment-form');
    if (nextForm !== null) {
      nextForm.classList.remove('is-hidden');
      const nextInput = nextForm.querySelector('.comment-input');
      if (nextInput !== null) {
        nextInput.focus();
      }
    }
  } catch (error) {
    toast(error.message, true);
  }
}

async function removePost(button, postId) {
  armConfirm(button, async () => {
    try {
      await apiPost('api/moments.php', { action: 'remove', id: postId });
      feed = feed.filter((one) => one.id !== postId);
      paintFeed();
      toast('已删除');
    } catch (error) {
      toast(error.message, true);
    }
  });
}

function wire() {
  const addBtn = $('#moment-add-img');
  const input = $('#moment-input');
  if (addBtn !== null && input !== null) {
    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      addFiles(Array.from(input.files ?? []));
      input.value = '';
    });
  }

  const picks = $('#moment-picks');
  if (picks !== null) {
    picks.addEventListener('click', (event) => {
      const rm = event.target.closest('[data-pick-rm]');
      if (rm === null) {
        return;
      }
      const index = Number(rm.dataset.pickRm);
      const [removed] = picked.splice(index, 1);
      if (removed !== undefined) {
        URL.revokeObjectURL(removed.url);
      }
      paintPicks();
    });
  }

  const publishBtn = $('#moment-publish');
  if (publishBtn !== null) {
    publishBtn.addEventListener('click', () => publish());
  }

  const text = $('#moment-text');
  if (text !== null) {
    text.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        publish();
      }
    });
  }

  const feedHost = $('#moment-feed');
  if (feedHost !== null) {
    feedHost.addEventListener('click', (event) => {
      const like = event.target.closest('[data-like]');
      if (like !== null) {
        toggleLike(Number(like.dataset.like));
        return;
      }
      const comment = event.target.closest('[data-comment]');
      if (comment !== null) {
        const card = comment.closest('.post-card');
        const form = card === null ? null : card.querySelector('.comment-form');
        if (form !== null) {
          form.classList.toggle('is-hidden');
          if (!form.classList.contains('is-hidden')) {
            const input = form.querySelector('.comment-input');
            if (input !== null) {
              input.focus();
            }
          }
        }
        return;
      }
      const del = event.target.closest('[data-del]');
      if (del !== null) {
        removePost(del, Number(del.dataset.del));
      }
    });

    feedHost.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-comment-form]');
      if (form === null) {
        return;
      }
      event.preventDefault();
      submitComment(form, Number(form.dataset.commentForm));
    });
  }
}

export function render() {
  paintPage('moments', '动态广场',
    '<section class="setting-block moment-composer">' +
      '<textarea class="composer-input moment-input" id="moment-text" rows="2" maxlength="2000" placeholder="分享新鲜事…"></textarea>' +
      '<div class="moment-picks" id="moment-picks"></div>' +
      '<div class="moment-tools">' +
        '<button type="button" class="btn btn-sm" id="moment-add-img">' + icon('image') + ' 图片 <span class="mono" id="moment-count">0/9</span></button>' +
        '<button type="button" class="btn btn-primary" id="moment-publish">' + icon('send') + ' 发布</button>' +
      '</div>' +
      '<input type="file" id="moment-input" class="is-hidden" accept="image/png,image/jpeg,image/gif,image/webp" multiple>' +
    '</section>' +
    '<div class="moment-feed" id="moment-feed"><p class="empty-note">动态加载中…</p></div>');
  if (picked.length > 0) {
    clearPicks();
  }
  wire();
  load().catch((error) => toast(error.message, true));
}
