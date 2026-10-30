# Meu calendário (PWA)

Aplicativo pessoal de calendário e acompanhamento de atividades desenvolvido especialmente para iPhone (instalado via *Adicionar à Tela de Início*).

## Tecnologias

- HTML5, CSS3 e JavaScript puro (módulos ES nativos, sem build step).
- Armazenamento local com **IndexedDB**.
- PWA instalável com Web App Manifest e **Service Worker** para funcionamento 100% offline.
- Totalmente compatível com GitHub Pages (caminhos relativos).

---

## Como fazer release (atualização de versão)

A versão tem **um único local de verdade**: [`src/version.js`](file:///Users/kmny/Documents/calendar-app/src/version.js).

### Passos para lançar uma nova versão

1. **Edite `src/version.js`** e atualize a atribuição `self.APP_VERSION`:
   ```javascript
   self.APP_VERSION = '0.2.0'; // ← apenas aqui
   ```
   - O footer da tela **Resumo** lê esse valor via import de efeito colateral (`import '../version.js'`).
   - O **Service Worker** lê esse valor diretamente via `importScripts('./src/version.js')`.  
     Mudar a versão altera o nome do cache (`meu-calendario-v0.2.0`), forçando o
     download dos novos arquivos no próximo acesso.

2. **Sincronize o `package.json`** executando:
   ```bash
   npm run version:sync
   ```
   Isso atualiza o campo `"version"` do `package.json` para igualar `src/version.js`.

3. **Faça o commit e o push** normalmente:
   ```bash
   git add src/version.js package.json
   git commit -m "chore: bump version to 0.2.0"
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

1. Com o app aberto e com o Service Worker ativo, altere a versão em `src/version.js` (por exemplo, de `'0.1.0'` para `'0.1.1'`) e faça uma alteração visual em `src/styles.css` ou em algum arquivo. Execute `npm run version:sync` para manter o `package.json` em sincro.
2. Na próxima vez que o app for aberto (ou recarregado):
   - O navegador detecta que o arquivo `sw.js` foi alterado byte a byte no servidor (pois `src/version.js` — importado por ele — mudou).
   - O novo Service Worker é instalado em segundo plano, chama `skipWaiting()` e ativa-se imediatamente.
   - Durante o evento `activate`, o `clients.claim()` assume o controle e apaga o cache antigo (`meu-calendario-v0.1.0`), substituindo-o pelo novo (`meu-calendario-v0.1.1`).
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
