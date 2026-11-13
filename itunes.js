/* Funções compartilhadas pelas três páginas: texto, cores e busca no iTunes */

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

/* Faixa já guardada (sem esperar a internet). undefined = ainda não foi buscada */
function faixaGuardada(musica) {
    const guardada = lerFaixasGuardadas()[chaveDaMusica(musica)]
    if (guardada && Date.now() - guardada.quando < validadeDoArmazenamento) return guardada.faixa
    return undefined
}

async function buscarPreviaDaMusica(musica) {
    const chave = chaveDaMusica(musica)
    const guardada = faixaGuardada(musica)
    if (guardada !== undefined) return guardada

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
