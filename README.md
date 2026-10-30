# Meu calendário (PWA)

Aplicativo pessoal de calendário e acompanhamento de atividades desenvolvido especialmente para iPhone (instalado via *Adicionar à Tela de Início*).

## Tecnologias

- HTML5, CSS3 e JavaScript puro (módulos ES nativos, sem build step).
- Armazenamento local com **IndexedDB**.
- PWA instalável com Web App Manifest e **Service Worker** para funcionamento 100% offline.
- Totalmente compatível com GitHub Pages (caminhos relativos).

---

## Como fazer release (atualização de versão)

Quando for lançar uma nova versão do app, atualize o número de versão nos seguintes locais:

1. **[`sw.js`](file:///Users/kmny/Documents/calendar-app/sw.js)**:
   Altere a constante `APP_VERSION`:
   ```javascript
   const APP_VERSION = '0.2.0'; // Altere aqui
   ```
   *Isto altera a chave de cache (`meu-calendario-v0.2.0`), acionando o download dos novos arquivos.*

2. **[`package.json`](file:///Users/kmny/Documents/calendar-app/package.json)**:
   Altere o campo `"version"`:
   ```json
   "version": "0.2.0"
   ```

3. **[`src/ui/summaryView.js`](file:///Users/kmny/Documents/calendar-app/src/ui/summaryView.js)**:
   Atualize o texto do rodapé na tela Resumo:
   ```html
   <p class="version-code">Versão 0.2.0</p>
   ```

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

1. Com o app aberto e com o Service Worker ativo, altere a versão em `sw.js` (por exemplo, de `'0.1.0'` para `'0.1.1'`) e faça uma alteração visual em `src/styles.css` ou em algum arquivo.
2. Na próxima vez que o app for aberto (ou recarregado):
   - O navegador detecta que o arquivo `sw.js` foi alterado byte a byte no servidor.
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
