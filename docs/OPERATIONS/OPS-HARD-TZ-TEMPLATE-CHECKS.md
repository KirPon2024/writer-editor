## PURPOSE
Канонические проверки allowlist для HARD-TZ (OPS write-задачи). Базируются на `git status --porcelain --untracked-files=all`.

## CHECKS

### ONLY_ALLOWED_CHANGE_NODE_SOFT
PASS если дерево чистое **или** если все изменённые пути входят в allowlist.

```bash
node -e 'const {execSync}=require("node:child_process");const allow=new Set(process.argv.slice(2));if(!allow.size){console.error("ALLOWLIST is empty");process.exit(2);}const out=execSync("git status --porcelain --untracked-files=all",{encoding:"utf8"}).trimEnd();if(!out){process.exit(0);}const changed=new Set(out.split("\n").map((line)=>{const p=line.slice(3);const parts=p.split(" -> ");return parts[parts.length-1];}));for(const p of changed){if(!allow.has(p)){console.error(`Disallowed change: ${p}`);process.exit(1);}}process.exit(0);' docs/path-a.md docs/path-b.md
```

### ONLY_ALLOWED_CHANGE_NODE_HARD
PASS только если дерево **НЕ** чистое и множество изменённых путей строго равно allowlist (set equality).

```bash
node -e 'const {execSync}=require("node:child_process");const allow=new Set(process.argv.slice(2));if(!allow.size){console.error("ALLOWLIST is empty");process.exit(2);}const out=execSync("git status --porcelain --untracked-files=all",{encoding:"utf8"}).trimEnd();if(!out){console.error("Working tree is clean");process.exit(1);}const changed=new Set(out.split("\n").map((line)=>{const p=line.slice(3);const parts=p.split(" -> ");return parts[parts.length-1];}));if(changed.size!==allow.size){console.error("Changed paths set != allowlist");process.exit(1);}for(const p of changed){if(!allow.has(p)){console.error(`Disallowed change: ${p}`);process.exit(1);}}for(const p of allow){if(!changed.has(p)){console.error(`Missing expected change: ${p}`);process.exit(1);}}process.exit(0);' docs/path-a.md docs/path-b.md
```
