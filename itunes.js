/* Funções compartilhadas pelas três páginas: texto, cores, fita cassete e busca no iTunes */

function escapar(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
}

function normalizar(texto) {
    return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

function matizDoGenero(genero) {
    if (!normalizar(genero)) return 255
    let matiz = 0
    for (const letra of normalizar(genero)) {
        matiz = (matiz * 31 + letra.charCodeAt(0)) % 360
    }
    return matiz
}

async function buscarComTempo(url, opcoes = {}) {
    const controle = new AbortController()
    const limite = setTimeout(() => controle.abort(), 15000)
    try {
        return await fetch(url, { ...opcoes, signal: controle.signal })
    } finally {
        clearTimeout(limite)
    }
}

function formatarTempo(segundos) {
    if (!Number.isFinite(segundos)) return "0:00"
    const total = Math.floor(segundos)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

/* ---------- Fita cassete ---------- */

let contadorDeFitas = 0

/* rotulo: texto da etiqueta (null = sem texto) · capa: URL da capa do álbum (null = etiqueta lisa) */
function fitaSVG(rotulo = null, capa = null) {
    const recorte = `fitaRecorte${++contadorDeFitas}`
    const bobina = (x) => `
        <circle class="fita-rolo fita-rolo-${x < 60 ? "esq" : "dir"}" cx="${x}" cy="35" r="12.5"/>
        <g class="fita-bobina">
            <circle class="fita-cubo" cx="${x}" cy="35" r="5.5"/>
            <path class="fita-raio" d="M${x} 31.4v7.2M${x - 3.1} 33.2l6.2 3.6M${x - 3.1} 36.8l6.2-3.6"/>
        </g>
    `
    return `
        <svg class="fita${capa ? " fita-com-capa" : ""}" viewBox="0 0 120 78" aria-hidden="true">
            <defs><clipPath id="${recorte}"><rect x="8" y="6" width="104" height="47" rx="5"/></clipPath></defs>
            <rect class="fita-corpo" x="0.5" y="0.5" width="119" height="77" rx="9"/>
            <rect class="fita-etiqueta" x="8" y="6" width="104" height="47" rx="5"/>
            ${capa
                ? `<image class="fita-capa" href="${escapar(capa)}" x="8" y="6" width="104" height="47" preserveAspectRatio="xMidYMid slice" clip-path="url(#${recorte})"/>
                   <rect class="fita-capa-sombra" x="8" y="6" width="104" height="47" rx="5"/>`
                : `<rect class="fita-faixa" x="8" y="43" width="104" height="10"/>`}
            ${rotulo !== null ? `<text class="fita-texto" x="14" y="16">${escapar(rotulo)}</text>` : ""}
            <rect class="fita-janela" x="24" y="22" width="72" height="26" rx="13"/>
            ${bobina(42)}
            ${bobina(78)}
            <path class="fita-base" d="M26 77.5 31 62h58l5 15.5z"/>
            <circle class="fita-furo" cx="40" cy="70" r="2.4"/>
            <circle class="fita-furo" cx="80" cy="70" r="2.4"/>
        </svg>
    `
}

function rotuloDaFita(titulo) {
    const texto = String(titulo ?? "").trim()
    return texto.length > 24 ? texto.slice(0, 23) + "…" : texto
}

/* ---------- iTunes ---------- */

const resultadosItunes = new Map()

async function pesquisarItunes(termo) {
    const chave = normalizar(termo).replace(/\s+/g, " ")
    if (!chave) return []
    if (resultadosItunes.has(chave)) return resultadosItunes.get(chave)

    const resposta = await buscarComTempo(`https://itunes.apple.com/search?term=${encodeURIComponent(termo)}&media=music&entity=song&limit=15&country=BR`)
    if (!resposta.ok) throw new Error("Resposta inválida")

    const dados = await resposta.json()
    const faixas = (dados.results || []).filter((faixa) => faixa.previewUrl)
    resultadosItunes.set(chave, faixas)
    return faixas
}

function escolherFaixa(resultados, musica) {
    const titulo = normalizar(musica.titulo).replace(/\s+/g, " ")
    const artista = normalizar(musica.artista).replace(/\s+/g, " ")
    const palavrasArtista = artista.split(" ").filter((palavra) => palavra.length >= 3)
    const versaoAlternativa = /\b(live|ao vivo|karaoke|instrumental|cover|remix|mix|a cappella|acapella|version|versao|edit|extended|eletronica|demo|acustico|acoustic|feat)\b/

    if (!titulo || !artista) return null

    let melhor = null
    let melhorPontos = 0

    for (const faixa of resultados) {
        if (!faixa.previewUrl) continue

        const nome = normalizar(faixa.trackName)
        const nomeBase = nome.replace(/\s*[([].*?[)\]]/g, "").trim()
        const autor = normalizar(faixa.artistName)

        let pontosArtista = 0
        if (autor === artista) pontosArtista = 3
        else if (autor.includes(artista) || artista.includes(autor)) pontosArtista = 2
        else if (palavrasArtista.some((palavra) => autor.split(/[\s,&]+/).includes(palavra))) pontosArtista = 1
        if (pontosArtista === 0) continue

        let pontosTitulo = 0
        if (nome === titulo || nomeBase === titulo) pontosTitulo = 4
        else if (nome.startsWith(titulo)) pontosTitulo = 2
        else if (nome.includes(titulo)) pontosTitulo = 1
        if (pontosTitulo === 0) continue

        let pontos = pontosArtista + pontosTitulo
        if (versaoAlternativa.test(nome) && !versaoAlternativa.test(titulo)) pontos -= 2

        const empate = pontos === melhorPontos && melhor && nome.length < normalizar(melhor.trackName).length
        if (pontos > melhorPontos || empate) {
            melhor = faixa
            melhorPontos = pontos
        }
    }

    return melhor
}

/* Capa em 300x300 (o iTunes devolve 100x100, mas aceita outros tamanhos na URL) */
function capaDaFaixa(faixa) {
    return faixa?.artworkUrl100 ? faixa.artworkUrl100.replace(/\d+x\d+bb/, "300x300bb") : null
}

/* Guarda no navegador a faixa encontrada para cada música, por 7 dias */
const chaveDoArmazenamento = "faixasItunes"
const validadeDoArmazenamento = 7 * 24 * 60 * 60 * 1000

function lerFaixasGuardadas() {
    try {
        return JSON.parse(localStorage.getItem(chaveDoArmazenamento)) || {}
    } catch {
        return {}
    }
}

function guardarFaixa(chave, faixa) {
    try {
        const guardadas = lerFaixasGuardadas()
        guardadas[chave] = {
            quando: Date.now(),
            faixa: faixa && {
                trackName: faixa.trackName,
                artistName: faixa.artistName,
                previewUrl: faixa.previewUrl,
                artworkUrl100: faixa.artworkUrl100,
                primaryGenreName: faixa.primaryGenreName
            }
        }
        localStorage.setItem(chaveDoArmazenamento, JSON.stringify(guardadas))
    } catch {}
}

function chaveDaMusica(musica) {
    return `${normalizar(musica.titulo)}|${normalizar(musica.artista)}`
}

async function buscarPreviaDaMusica(musica) {
    const chave = chaveDaMusica(musica)
    const guardada = lerFaixasGuardadas()[chave]
    if (guardada && Date.now() - guardada.quando < validadeDoArmazenamento) return guardada.faixa

    const resultados = await pesquisarItunes(`${musica.titulo} ${musica.artista}`)
    const faixa = escolherFaixa(resultados, musica)
    guardarFaixa(chave, faixa)
    return faixa
}

/* Converte uma faixa do iTunes nos campos do nosso cadastro */
function dadosDaFaixa(faixa) {
    const titulo = String(faixa.trackName || "")
        .replace(/\s*[([][^)\]]*(remaster|remasteriz|feat\.|ft\.|mono|stereo|bonus)[^)\]]*[)\]]/gi, "")
        .trim()

    const ano = faixa.releaseDate ? new Date(faixa.releaseDate).getFullYear() : ""
    const duracao = faixa.trackTimeMillis ? Math.max(1, Math.round(faixa.trackTimeMillis / 60000)) : ""

    return {
        titulo: titulo || faixa.trackName || "",
        artista: faixa.artistName || "",
        genero: faixa.primaryGenreName || "",
        ano: Number.isFinite(ano) ? ano : "",
        duracao
    }
}
