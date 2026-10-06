# Auditoria IATF 16949:2016 (PWA)

App web instalável para auditorias internas (SGQ), com checklist por cláusula, comentários, evidências (fotos/PDF), resumo, histórico, numeração sequencial (`AUD-ANO-0001`), rastreabilidade e exportação/importação JSON/CSV.

## Publicar no GitHub Pages
1. Crie um repositório e envie todo este conteúdo (pasta `public/`, `.github/`, `README.md`) na branch `main`.
2. Em **Settings → Pages**, selecione **Source: GitHub Actions**.
3. O workflow `Publicar PWA no GitHub Pages` roda a cada push e publica a pasta `public/`.
4. Abra a URL `https://SEU-USUARIO.github.io/SEU-REPO/` no Chrome do Android e toque em **Instalar app**.

## Dados
- Tudo fica no aparelho (IndexedDB). Use **Exportar** para backup periódico.
- Formato de exportação: JSON `iatf-audit-export` v1 (pensado para importação em um futuro site).

## Checklist
- Base: `public/js/checklist.js` (perguntas redigidas a partir do PDF da norma). Itens com `"u":1` aparecem como **conferir**: não foram lidos integralmente na extração do PDF.
- Ajustes e itens de CSR: em **Config. → Checklist**, importe CSV (`clausula;titulo;pergunta`).

## Atualizar versão
Ao alterar arquivos, mude `CACHE` em `public/sw.js` para o navegador atualizar o cache offline.
