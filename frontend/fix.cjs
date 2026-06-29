const fs = require('fs');
const file = 'src/data/blog-posts.tsx';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/src="\/docs\//g, 'src={`${import.meta.env.BASE_URL}docs/');
content = content.replace(/src="\/images\//g, 'src={`${import.meta.env.BASE_URL}images/');
content = content.replace(/src=\{`\$\{import\.meta\.env\.BASE_URL\}([^"]+)"/g, 'src={`${import.meta.env.BASE_URL}$1`}');
fs.writeFileSync(file, content);
