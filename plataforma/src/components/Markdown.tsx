import type { ReactNode } from "react";

// Markdown simples, sem dependências, para textos editados pelo admin (Termos de Uso):
// # títulos, parágrafos, **negrito**, [links](url), listas (- e 1.), > citações e tabelas com |.
// Não aceita HTML: tudo vira texto, então não há como injetar código pela edição.

function inline(texto: string, chave: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    if (m[1] !== undefined) partes.push(<strong key={`${chave}-${i++}`}>{inline(m[1], `${chave}-b${i}`)}</strong>);
    else {
      const url = m[3];
      const seguro = /^(https?:\/\/|mailto:|\/)/i.test(url);
      partes.push(
        seguro ? (
          <a key={`${chave}-${i++}`} href={url} {...(/^https?:/i.test(url) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {m[2]}
          </a>
        ) : (
          m[2]
        ),
      );
    }
    ultimo = re.lastIndex;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

const celulas = (linha: string) =>
  linha
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ texto, className }: { texto: string; className?: string }) {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    const titulo = l.match(/^(#{1,4})\s+(.*)$/);
    if (titulo) {
      const nivel = titulo[1].length <= 2 ? 2 : titulo[1].length === 3 ? 3 : 4; // # e ## viram h2: o h1 é o da página
      const Tag = `h${nivel}` as "h2" | "h3" | "h4";
      blocos.push(<Tag key={k++}>{inline(titulo[2], `t${k}`)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{3,}/.test(linhas[i + 1] ?? "")) {
      const cabeca = celulas(l);
      i += 2;
      const corpo: string[][] = [];
      while (i < linhas.length && /^\s*\|/.test(linhas[i])) corpo.push(celulas(linhas[i++]));
      const temCabeca = cabeca.some((c) => c);
      blocos.push(
        <div key={k++} className="md-tabela">
          <table>
            {temCabeca && (
              <thead>
                <tr>
                  {cabeca.map((c, j) => (
                    <th key={j}>{inline(c, `h${k}${j}`)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {corpo.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, `c${k}${ri}${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordenada = /^\s*\d+\./.test(l);
      const itens: string[] = [];
      while (i < linhas.length && /^\s*([-*]|\d+\.)\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const Lista = ordenada ? "ol" : "ul";
      blocos.push(
        <Lista key={k++}>
          {itens.map((t, j) => (
            <li key={j}>{inline(t, `l${k}${j}`)}</li>
          ))}
        </Lista>,
      );
      continue;
    }
    if (/^>\s?/.test(l)) {
      const citacao: string[] = [];
      while (i < linhas.length && /^>\s?/.test(linhas[i])) citacao.push(linhas[i++].replace(/^>\s?/, ""));
      blocos.push(
        <blockquote key={k++}>
          <p>{inline(citacao.join(" "), `q${k}`)}</p>
        </blockquote>,
      );
      continue;
    }
    const paragrafo: string[] = [];
    while (i < linhas.length && linhas[i].trim() && !/^(#{1,4}\s|>|\s*\||\s*([-*]|\d+\.)\s)/.test(linhas[i])) paragrafo.push(linhas[i++].trim());
    if (!paragrafo.length) paragrafo.push(linhas[i++].trim());
    blocos.push(<p key={k++}>{inline(paragrafo.join(" "), `p${k}`)}</p>);
  }
  return <div className={className}>{blocos}</div>;
}
