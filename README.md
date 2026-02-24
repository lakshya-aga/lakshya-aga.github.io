# lakshya-aga.github.io

Personal website for **Lakshya Agarwal** — Quantitative Developer, Systems Engineer, ML Researcher.

🌐 **Live site:** [lakshya-aga.github.io](https://lakshya-aga.github.io)

---

## 📁 Repo Structure

```
lakshya-aga.github.io/
├── index.html          # Main website (single file)
└── README.md           # This file
```

---

## 🚀 Deployment (GitHub Pages)

1. Create a repo named exactly `lakshya-aga.github.io`
2. Push `index.html` and `README.md` to the `main` branch
3. Go to **Settings → Pages → Source: Deploy from branch → main → / (root)**
4. Your site will be live at `https://lakshya-aga.github.io` within ~1 minute

---

## ➕ Adding Your Repositories

### Option A — Link to GitHub Repos (Simplest)

Edit the `index.html` and find the `<div id="projects-grid">` section. Each project card looks like this:

```html
<a class="project-card reveal" href="YOUR_REPO_URL" target="_blank">
  <div class="project-type">📊 Quant Research</div>
  <div class="project-title">Your Project Title</div>
  <div class="project-desc">A short description of what this repo does.</div>
  <div class="project-tags">
    <span class="tag">Python</span>
    <span class="tag">Jupyter</span>
  </div>
</a>
```

**Project type labels to use for consistency:**

| Label | Use for |
|---|---|
| `📓 Knowledge Base` | Obsidian vaults, notes repos |
| `📊 Quant Research` | Jupyter notebook research repos |
| `🤖 ML Research` | ML experiments, model training repos |
| `🛠 Full-Stack App` | Web apps with frontend + backend |
| `⚙ Backend Tool` | APIs, CLI tools, standalone services |
| `🗄 Systems / C++` | Low-level / systems programming |
| `🔍 Dev Tool` | Developer utilities |
| `⛓ Blockchain` | Smart contracts, DeFi |

---

### Option B — Auto-Fetch via GitHub API (Advanced)

Add this script before `</body>` in `index.html` to auto-pull your pinned repos:

```html
<script>
  async function loadGitHubRepos() {
    const username = 'lakshya-aga';
    const res = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=12`);
    const repos = await res.json();
    const container = document.getElementById('additional-repos');
    if (!container || !Array.isArray(repos)) return;

    const grid = document.createElement('div');
    grid.className = 'projects-grid';

    repos
      .filter(r => !r.fork && r.name !== `${username}.github.io`)
      .slice(0, 6)
      .forEach(repo => {
        grid.innerHTML += `
          <a class="project-card reveal" href="${repo.html_url}" target="_blank">
            <div class="project-type">⚙ Repository</div>
            <div class="project-title">${repo.name}</div>
            <div class="project-desc">${repo.description || 'No description provided.'}</div>
            <div class="project-tags">
              ${repo.language ? `<span class="tag">${repo.language}</span>` : ''}
              <span class="tag">⭐ ${repo.stargazers_count}</span>
            </div>
          </a>`;
      });

    container.appendChild(grid);

    // Re-observe new cards
    document.querySelectorAll('#additional-repos .reveal').forEach(el => observer.observe(el));
  }
  loadGitHubRepos();
</script>
```

---

## 🗂 Linked Repositories

Add your repos here as you create them:

### 📓 Knowledge Base
- **[ubiquitous-enigma](https://github.com/lakshya-aga/ubiquitous-enigma)** — Obsidian vault: research notes on quant finance, ML, systems, and trading ideas

### 📊 Quant Research (Jupyter Notebooks)
<!-- Add entries like:
- **[repo-name](https://github.com/lakshya-aga/repo-name)** — Short description
-->

### 🤖 ML / Deep Learning
<!-- Add entries like:
- **[repo-name](https://github.com/lakshya-aga/repo-name)** — Short description
-->

### ⚙ Tools & Projects
<!-- Add entries like:
- **[repo-name](https://github.com/lakshya-aga/repo-name)** — Short description
-->

---

## 🎨 Customisation

### Update contact links
Search `index.html` for `lakshya001@e.ntu.edu.sg` and replace with your current email.
Search for `lakshya-aga` in GitHub and LinkedIn URLs to update usernames.

### Update phone number
Search for `+65 8539 0106` in `index.html`.

### Change color accent
At the top of `index.html`, find `:root` and change:
```css
--accent: #c8a96e;    /* gold — change to any hex */
--accent2: #4ea8de;   /* blue — change to any hex */
```

---

## 📄 License

MIT — feel free to fork and adapt for your own portfolio.