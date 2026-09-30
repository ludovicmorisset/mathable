# Mathable Online
Projet Node.js/Express + Socket.IO + PostgreSQL, en français. Le moteur serveur partagé est dans `server/src/game/rules.js` et reprend le sac de 106 tuiles, le plateau 14×14 et les cases spéciales du fichier fourni.

## Installation
`cp .env.example .env && npm install && npm test && npm start`. PostgreSQL est requis pour l'authentification et les parties persistées. Exécuter la migration `server/migrations/001_init.sql` au premier démarrage (ou via votre outil de migrations).

## Docker / VPS
`docker compose up -d --build`; adaptez les secrets dans `.env` et compose. Placez Nginx devant l'app, proxifiez `/socket.io/` avec `proxy_http_version 1.1`, `Upgrade` et `Connection`; activez HTTPS via Certbot/Let's Encrypt. Pour mettre à jour: sauvegarder PostgreSQL (`pg_dump`), `git pull`, `docker compose up -d --build`. Le volume `pgdata` conserve les données.

Variables: `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Sans SMTP en développement, les codes sont affichés dans les logs.

## Limites connues
La migration SQL doit être appliquée avant les routes d'authentification. Le frontend livré conserve l'interface solo autonome fournie et l'API temps réel sécurisée constitue la base d'intégration du lobby multijoueur.
