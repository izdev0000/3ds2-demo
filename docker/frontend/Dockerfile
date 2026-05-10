FROM node:22-alpine

WORKDIR /app

# 開発用イメージ。実ソースは compose 側でバインドマウントするため、
# ビルド時に COPY せず、初回起動時に node_modules を生成する運用にする。
EXPOSE 5173
CMD ["sh", "-c", "if [ ! -d node_modules ] || [ -z \"$(ls -A node_modules 2>/dev/null)\" ]; then npm install; fi && npm run dev -- --host 0.0.0.0"]
