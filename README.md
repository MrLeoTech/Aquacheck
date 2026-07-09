# AquaCheck v3.1 - Qualidade da Água

**Parque Aquático de Amarante**

Aplicação PWA para controlo diário da qualidade da água das piscinas.

---

## Novidades v3.1

- IndexedDB para armazenamento robusto (fotos, assinaturas, registos)
- OCR real com Tesseract.js
- Progresso diário e lista de leituras pendentes
- Relatório PDF diário
- Gráficos de tendência por piscina
- PIN de acesso opcional
- Campos obrigatórios configuráveis
- Auto-save e validação antes de guardar
- Filtros avançados no histórico
- Notificações de leituras pendentes
- Remover fotografias
- Comparação entre leituras do mesmo dia
- Backup JSON automático periódico
- Ícones PWA incluídos

## Piscinas ativas (5)

Ondas, Adultos, Infantil, Aquaspray, Mini Compact Slide — mais piscinas podem ser adicionadas manualmente em Definições.

## Registos Diários

3 registos por piscina (configurável): **08:00**, **13:00**, **17:00**

## Desenvolvimento local

```bash
npm install
npm run dev
```

Abre **http://localhost:5180** (porta dedicada ao AquaCheck).

> **Nota:** Se vires "LeoStaff" no browser, estás no projeto errado ou na porta **5173** (outra app). Usa sempre **5180** para o AquaCheck.

1. Comprima a pasta em ZIP
2. [netlify.com](https://www.netlify.com) → **Deploy manually**
3. Arraste o ZIP

---

*AquaCheck Water Quality v3.1.0*
