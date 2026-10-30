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
- **Service Worker (`sw.js`)**: O script `scripts/sync-version.js` carimba `const SW_VERSION = '...';` diretamente em `sw.js`. O nome do cache é derivado de `SW_VERSION` (`agenda-v${SW_VERSION}`). Na ativação, o Service Worker limpa caches de versões antigas e remove caches legados (`meu-calendario-*`).

---

## Fluxo de Atualização (Update Flow)

Para garantir detecção imediata de novas versões mesmo com o cache HTTP do GitHub Pages (`max-age=600`):

1. **Alteração de bytes em `sw.js`**:
   O comando `npm run version:sync` reescreve a constante `SW_VERSION` no próprio `sw.js`. Como os bytes do próprio `sw.js` mudam, a checagem byte a byte do navegador sempre detecta a nova versão.
2. **Registro com `{ updateViaCache: 'none' }`**:
   O Service Worker é registrado com `updateViaCache: 'none'`, forçando o navegador a consultar a rede (sem cache HTTP) ao verificar atualizações do `sw.js` e de scripts importados via `importScripts()`.
3. **Precache com `cache: 'reload'`**:
   Durante a instalação, os assets do app shell são baixados usando objetos `Request(url, { cache: 'reload' })`, garantindo que os novos arquivos venham diretamente da rede e não do cache HTTP local. Se alguma URL falhar, ela é registrada explicitamente via `console.error`.
4. **Verificação de atualização**:
   `registration.update()` é disparado na inicialização do app e sempre que a aplicação se torna visível novamente (`visibilitychange`).
5. **Transição de controle (`controllerchange`) e Proteção de Edição**:
   Quando um novo Service Worker assume o controle (`clients.claim()`):
   - Se o usuário **não estiver** com formulário aberto, a página recarrega automaticamente uma única vez (protegido contra loops).
   - Se o usuário **estiver** com formulário aberto (ex: criando ou editando atividade), o recarregamento automático é suspenso para não perder dados digitados e um banner estilo iOS é exibido:  
     *“Nova versão disponível. Toque para atualizar.”*  
     Ao tocar no banner, a página é atualizada manualmente.

---

## Como fazer release (atualização de versão)

### Passos para lançar uma nova versão

1. **Edite `src/version.js`** e atualize a atribuição `self.APP_VERSION`:
   ```javascript
   self.APP_VERSION = '0.2.1'; // ← altere apenas aqui
   ```

2. **Sincronize todos os arquivos** executando:
   ```bash
   npm run version:sync
   ```
   Isso atualiza automaticamente:
   - `package.json` (`"version"`)
   - `manifest.webmanifest` (`name` e `short_name`)
   - `sw.js` (carimba `const SW_VERSION = '0.2.1';` alterando os bytes do arquivo e a chave de cache `agenda-v0.2.1`)

3. **Faça o commit e o push**:
   ```bash
   git add src/version.js sw.js package.json manifest.webmanifest
   git commit -m "chore: bump version to 0.2.1"
   git push
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
   - O aplicativo carrega instantaneamente do cache local, e todas as ações continuam funcionando via IndexedDB.

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
