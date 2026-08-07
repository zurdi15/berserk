// v0.11.1 (zurdi: "si busco elíptica tiene que poder encontrar eliptica"):
// pliegue común para TODA búsqueda de la app — minúsculas + sin diacríticos
// (NFD separa la marca combinante y el rango U+0300–U+036F la elimina).
// Aplicar SIEMPRE a ambos lados (consulta y pajar): así "elíptica" encuentra
// "eliptica" y viceversa.
export function foldSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}
