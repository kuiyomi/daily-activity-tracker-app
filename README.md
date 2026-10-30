# Agenda (PWA)

Aplicativo pessoal de agenda e acompanhamento de atividades desenvolvido especialmente para iPhone (instalado via *Adicionar à Tela de Início*).

## Tecnologias

- HTML5, CSS3 e JavaScript puro (módulos ES nativos, sem build step).
- Armazenamento local com **IndexedDB** (`DadsCalendarDB` mantido para compatibilidade e preservação dos dados existentes).
- PWA instalável com Web App Manifest e **Service Worker** para funcionamento 100% offline.
- Totalmente compatível com GitHub Pages (caminhos relativos).

---

## Identidade e Versão do Aplicativo

A versão e o nome do aplicativo possuem **um único local de verdade**: [`src/version.js`](file:///Users/kmny/Documents/calendar-app/src/version.js).

```javascript
self.APP_VERSION = '0.2.0';
self.APP_NAME = 'Agenda';
```

- **Manifesto & PWA**: O nome (`name` e `short_name`) é sincronizado com `self.APP_NAME` em `manifest.webmanifest`.
- **iOS Safari**: O `<title>` e a meta tag `<meta name="apple-mobile-web-app-title">` utilizam `self.APP_NAME`.
- **Interface e "Sobre"**: Os títulos principais e o rodapé da tela **Resumo** leem `self.APP_NAME` e `self.APP_VERSION`.
- **Service Worker**: O cache atual utiliza o prefixo `agenda-v${APP_VERSION}` (ex: `agenda-v0.2.0`). Na ativação, o Service Worker limpa automaticamente caches de versões antigas e também remove quaisquer caches legados com prefixo `meu-calendario-*`.

---

## Como fazer release (atualização de versão)

### Passos para lançar uma nova versão

1. **Edite `src/version.js`** e atualize a atribuição `self.APP_VERSION`:
   ```javascript
   self.APP_VERSION = '0.2.1'; // ← apenas aqui
   ```
   - O footer da tela **Resumo** lê esse valor via import de efeito colateral (`import '../version.js'`).
   - O **Service Worker** lê esse valor diretamente via `importScripts('./src/version.js')`.  
     Mudar a versão altera o nome do cache (`agenda-v0.2.1`), forçando o
     download dos novos arquivos no próximo acesso.

2. **Sincronize o `package.json` e o `manifest.webmanifest`** executando:
   ```bash
   npm run version:sync
   ```
   Isso atualiza o campo `"version"` do `package.json` e os campos do manifesto para sincronizar com `src/version.js`.

3. **Faça o commit e o push** normalmente:
   ```bash
   git add src/version.js package.json manifest.webmanifest
   git commit -m "chore: bump version to 0.2.1"
   git push
   ```

> **Não é necessário** editar `sw.js`, `summaryView.js` ou qualquer outro arquivo
> para atualizar a versão — o `src/version.js` propaga automaticamente.

---

## Como testar o modo offline

1. Inicie um servidor HTTP local:
   ```bash
   npx serve .
   # ou
   python3 -m http.server 8000
   ```
2. Abra no navegador (Safari ou Chrome) em `http://localhost:8000`.
3. Abra as Ferramentas do Desenvolvedor (DevTools):
   - No Chrome: Aba **Application** → **Service Workers** (verifique se o status está *Activated and running*).
   - Na aba **Network**, marque a opção **Offline** (ou desconecte o Wi-Fi / modo avião no iPhone).
4. Recarregue a página ou navegue entre as abas:
   - O aplicativo carrega instantaneamente do cache local, e todas as ações (marcar atividades, navegar pelos meses) continuam funcionando via IndexedDB.

---

## Como testar o fluxo de atualização (Update Flow)

O aplicativo utiliza `self.skipWaiting()` e `clients.claim()` no Service Worker:

1. Com o app aberto e com o Service Worker ativo, altere a versão em `src/version.js` (por exemplo, de `'0.2.0'` para `'0.2.1'`) e faça uma alteração visual em `src/styles.css` ou em algum arquivo. Execute `npm run version:sync` para manter o `package.json` em sincro.
2. Na próxima vez que o app for aberto (ou recarregado):
   - O navegador detecta que o arquivo `sw.js` foi alterado byte a byte no servidor (pois `src/version.js` — importado por ele — mudou).
   - O novo Service Worker é instalado em segundo plano, chama `skipWaiting()` e ativa-se imediatamente.
   - Durante o evento `activate`, o `clients.claim()` assume o controle e apaga o cache antigo (`agenda-v0.2.0` bem como quaisquer caches `meu-calendario-*`), substituindo-o pelo novo (`agenda-v0.2.1`).
   - Na abertura seguinte do app, o usuário já vê a versão nova sem precisar limpar cache ou fazer qualquer ação manual.

---

## Gerar ícones do aplicativo

Para recriar os ícones PNG (180x180, 192x192 e 512x512) a partir do vetor Phosphor:

```bash
node scripts/generate-icons.js
```

## Testes automatizados

Para rodar todos os testes unitários de lógica pura:

```bash
npm test
```
