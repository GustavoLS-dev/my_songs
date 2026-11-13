const urlBackend = "https://backend-songs.vercel.app"

const listaMusicas = document.getElementById("listaMusicas")
const inputBusca = document.getElementById("busca")
const contagem = document.getElementById("contagem")
const totalMusicas = document.getElementById("totalMusicas")
const totalGeneros = document.getElementById("totalGeneros")
const totalMinutos = document.getElementById("totalMinutos")
const graficoBarra = document.getElementById("graficoBarra")
const graficoLegenda = document.getElementById("graficoLegenda")

const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches

let musicas = []

let buscandoPrevia = false
const audio = new Audio()
let tocandoId = null

/* Fundo que pulsa com a batida, na cor do gênero da música que está tocando */
const fundoReativo = criarFundoReativo(audio, () => {
    const musica = musicas.find((item) => Number(item.id) === tocandoId)
    return musica ? matizDoGenero(musica.genero) : 255
})

/* Capas dos álbuns já encontradas no iTunes (chave da música -> URL) */
const capas = new Map()

/* ---------- Utilidades (as demais ficam em itunes.js) ---------- */

function esperarAnimacao(elemento, tempo) {
    return new Promise((resolver) => {
        const fim = () => resolver()
        elemento.addEventListener("animationend", fim, { once: true })
        setTimeout(fim, reduzirMovimento ? 0 : tempo)
    })
}

/* ---------- Toasts ---------- */

function mostrarToast(mensagem, tipo = "sucesso") {
    const toasts = document.getElementById("toasts")
    const toast = document.createElement("div")
    const icone = tipo === "erro"
        ? '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'

    toast.className = `toast toast-${tipo}`
    toast.setAttribute("role", tipo === "erro" ? "alert" : "status")
    toast.innerHTML = `<span class="toast-icone">${icone}</span><span></span>`
    toast.lastElementChild.textContent = mensagem
    toasts.appendChild(toast)

    setTimeout(() => {
        toast.classList.add("saindo")
        setTimeout(() => toast.remove(), reduzirMovimento ? 0 : 300)
    }, 3400)
}

function mostrarAvisoGuardado() {
    try {
        const aviso = sessionStorage.getItem("aviso")
        if (aviso) {
            sessionStorage.removeItem("aviso")
            mostrarToast(aviso)
        }
    } catch {}
}

/* ---------- Transição entre páginas ---------- */

document.addEventListener("click", (evento) => {
    const link = evento.target.closest("a[href]")
    if (!link || evento.defaultPrevented || evento.button !== 0) return
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || link.target) return

    const destino = new URL(link.href, window.location.href)
    if (destino.origin !== window.location.origin || destino.href === window.location.href) return

    evento.preventDefault()
    document.body.classList.add("saindo")
    setTimeout(() => { window.location.href = destino.href }, reduzirMovimento ? 0 : 180)
})

window.addEventListener("pageshow", () => document.body.classList.remove("saindo"))

/* ---------- Painel de dados ---------- */

function animarNumero(elemento, valorFinal) {
    const inicio = Number(elemento.dataset.valor || 0)
    elemento.dataset.valor = valorFinal

    if (reduzirMovimento || inicio === valorFinal) {
        elemento.textContent = valorFinal.toLocaleString("pt-BR")
        return
    }

    const duracao = 700
    const comeco = performance.now()

    function passo(agora) {
        const progresso = Math.min((agora - comeco) / duracao, 1)
        const suave = 1 - Math.pow(1 - progresso, 3)
        elemento.textContent = Math.round(inicio + (valorFinal - inicio) * suave).toLocaleString("pt-BR")
        if (progresso < 1) requestAnimationFrame(passo)
    }

    requestAnimationFrame(passo)
}

function atualizarPainel() {
    const generos = new Map()

    musicas.forEach((musica) => {
        const chave = normalizar(musica.genero)
        const grupo = generos.get(chave) || { nome: String(musica.genero).trim(), quantidade: 0 }
        grupo.quantidade++
        generos.set(chave, grupo)
    })

    const minutos = musicas.reduce((soma, musica) => soma + (Number(musica.duracao) || 0), 0)

    animarNumero(totalMusicas, musicas.length)
    animarNumero(totalGeneros, generos.size)
    animarNumero(totalMinutos, minutos)

    const grupos = [...generos.values()].sort((a, b) => b.quantidade - a.quantidade)

    graficoBarra.innerHTML = grupos.map((grupo) => `
        <span class="grafico-segmento" style="--matiz: ${matizDoGenero(grupo.nome)}; flex-grow: ${grupo.quantidade}"></span>
    `).join("")

    graficoLegenda.innerHTML = grupos.map((grupo) => `
        <li style="--matiz: ${matizDoGenero(grupo.nome)}"><i></i>${escapar(grupo.nome)} <b>${grupo.quantidade}</b></li>
    `).join("")

    graficoBarra.setAttribute("aria-label", grupos.length
        ? "Distribuição por gênero: " + grupos.map((grupo) => `${grupo.nome}, ${grupo.quantidade}`).join("; ")
        : "Nenhum gênero cadastrado")
}

/* ---------- Lista ---------- */

function mostrarCarregando() {
    listaMusicas.setAttribute("aria-busy", "true")
    listaMusicas.innerHTML = Array.from({ length: 4 }, () => `
        <article class="musica esqueleto" aria-hidden="true">
            <div class="capa"></div>
            <div class="info">
                <div class="linha" style="width: 42%"></div>
                <div class="linha" style="width: 26%"></div>
            </div>
        </article>
    `).join("")
    contagem.textContent = "Carregando músicas…"
}

function mostrarErro() {
    listaMusicas.setAttribute("aria-busy", "false")
    contagem.textContent = ""
    listaMusicas.innerHTML = `
        <div class="estado erro">
            <span class="estado-icone"><svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/></svg></span>
            <h2>Não foi possível carregar</h2>
            <p>O servidor não respondeu. Verifique sua conexão e tente de novo.</p>
            <button class="botao-secundario" id="tentarDeNovo">Tentar de novo</button>
        </div>
    `
    document.getElementById("tentarDeNovo").addEventListener("click", buscarMusicas)
}

function cartaoMusica(musica, posicao) {
    const ativa = Number(musica.id) === tocandoId
    const estado = ativa ? (buscandoPrevia ? " buscando" : (!audio.paused ? " tocando" : "")) : ""

    return `
        <article class="musica${estado}" data-id="${Number(musica.id)}" style="--i: ${posicao}; --matiz: ${matizDoGenero(musica.genero)}">
            <button class="capa" aria-label="Tocar prévia de ${escapar(musica.titulo)}">
                ${ipodMiniHTML(capas.get(chaveDaMusica(musica)) || null)}
                <span class="capa-acao" aria-hidden="true">
                    <svg class="icone-tocar" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>
                    <svg class="icone-pausar" viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>
                    <span class="spinner"></span>
                </span>
            </button>
            <div class="info">
                <h2>${escapar(musica.titulo)}</h2>
                <p class="artista">${escapar(musica.artista)}</p>
                <p class="detalhes">
                    <span class="chip">${escapar(musica.genero)}</span>
                    <span>${escapar(musica.ano)}</span>
                    <span>${escapar(musica.duracao)} min</span>
                </p>
            </div>
            <div class="acoes">
                <a class="editar" href="editar.html?id=${Number(musica.id)}" aria-label="Editar ${escapar(musica.titulo)}">
                    <svg class="acao-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>
                    <span class="acao-texto">Editar</span>
                </a>
                <button class="apagar" onclick="apagarMusica(${Number(musica.id)})" aria-label="Apagar ${escapar(musica.titulo)}">
                    <svg class="acao-icone" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                    <span class="acao-texto">Apagar</span>
                </button>
            </div>
        </article>
    `
}

function renderizarLista(animar = true) {
    listaMusicas.setAttribute("aria-busy", "false")

    if (musicas.length === 0) {
        contagem.textContent = ""
        listaMusicas.innerHTML = `
            <div class="estado">
                <span class="estado-icone"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>
                <h2>Sua biblioteca está vazia</h2>
                <p>Cadastre a primeira música e ela aparece aqui na hora.</p>
                <a class="botao-primario" href="cadastrar.html">Cadastrar música</a>
            </div>
        `
        return
    }

    const termo = normalizar(inputBusca.value)
    const filtradas = musicas.filter((musica) =>
        [musica.titulo, musica.artista, musica.genero].some((campo) => normalizar(campo).includes(termo))
    )

    contagem.textContent = termo
        ? `${filtradas.length} de ${musicas.length} músicas`
        : `${musicas.length} ${musicas.length === 1 ? "música" : "músicas"}`

    if (filtradas.length === 0) {
        listaMusicas.innerHTML = `
            <div class="estado">
                <span class="estado-icone"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>
                <h2>Nada encontrado</h2>
                <p>Nenhuma música combina com “${escapar(inputBusca.value.trim())}”.</p>
                <button class="botao-secundario" id="limparBusca">Limpar busca</button>
            </div>
        `
        document.getElementById("limparBusca").addEventListener("click", () => {
            inputBusca.value = ""
            renderizarLista()
            inputBusca.focus()
        })
        return
    }

    listaMusicas.innerHTML = filtradas.map(cartaoMusica).join("")

    if (animar) {
        listaMusicas.querySelectorAll(".musica").forEach((cartao) => cartao.classList.add("animar"))
    }

    if (tocandoId) marcarEstado()
}

async function buscarMusicas() {
    mostrarCarregando()

    try {
        const resposta = await buscarComTempo(urlBackend)
        if (!resposta.ok) throw new Error("Resposta inválida")

        musicas = await resposta.json()

        atualizarPainel()
        renderizarLista()
    } catch {
        mostrarErro()
        return
    }

    carregarCapas()
}

/* ---------- Capas dos álbuns (iTunes) ---------- */

function colocarCapaNoCartao(musica) {
    const capa = capas.get(chaveDaMusica(musica))
    const tela = listaMusicas.querySelector(`.musica[data-id="${Number(musica.id)}"] .ipod-capa`)
    if (!capa || !tela) return

    tela.classList.add("com-capa")
    tela.style.backgroundImage = `url("${capa}")`
}

async function carregarCapas() {
    const pendentes = musicas.filter((musica) => !capas.has(chaveDaMusica(musica)))
    let proxima = 0

    async function buscarProximas() {
        while (proxima < pendentes.length) {
            const musica = pendentes[proxima++]
            try {
                const faixa = await buscarPreviaDaMusica(musica)
                capas.set(chaveDaMusica(musica), capaDaFaixa(faixa))
                colocarCapaNoCartao(musica)
            } catch {}
        }
    }

    await Promise.all([buscarProximas(), buscarProximas()])
}

inputBusca.addEventListener("input", () => renderizarLista(false))

/* ---------- Tocador: popup com o aparelho + versão minimizada ---------- */

const tocador = document.getElementById("tocador")
const tocadorFundo = document.getElementById("tocadorFundo")
const tocadorAparelho = document.getElementById("tocadorAparelho")
const tocadorSpotify = document.getElementById("tocadorSpotify")
const tocadorFechar = document.getElementById("tocadorFechar")

const miniTocador = document.getElementById("miniTocador")
const miniAbrir = document.getElementById("miniAbrir")
const miniCapa = document.getElementById("miniCapa")
const miniTitulo = document.getElementById("miniTitulo")
const miniArtista = document.getElementById("miniArtista")
const miniTocar = document.getElementById("miniTocar")
const miniFechar = document.getElementById("miniFechar")
const miniBarra = document.getElementById("miniBarra")

tocadorAparelho.innerHTML = ipodGrandeHTML()

const aparelho = criarIpod(tocadorAparelho, {
    tocar: alternarTocar,
    menu: minimizarTocador,
    anterior: () => pularMusica(-1),
    proxima: () => pularMusica(1),
    girar: (graus) => avancar((graus / 360) * 15)
})

let pedidoAtual = 0
let focoAntesDoTocador = null

function detalhesDaMusica(musica) {
    return [musica.genero, musica.ano, `${musica.duracao} min`].join(" · ")
}

function marcarEstado() {
    const tocando = Boolean(tocandoId) && !buscandoPrevia && !audio.paused

    listaMusicas.querySelectorAll(".musica:not(.esqueleto)").forEach((cartao) => {
        const ativa = Number(cartao.dataset.id) === tocandoId
        const titulo = cartao.querySelector("h2")?.textContent || ""
        const mini = cartao.querySelector(".ipod")

        cartao.classList.toggle("buscando", ativa && buscandoPrevia)
        cartao.classList.toggle("tocando", ativa && tocando)
        mini?.classList.toggle("tocando", ativa && tocando)
        if (!ativa) mini?.style.removeProperty("--progresso")
        cartao.querySelector(".capa")?.setAttribute("aria-label", `${ativa && tocando ? "Pausar" : "Tocar"} prévia de ${titulo}`)
    })

    aparelho.tocando(tocando)
    aparelho.buscando(buscandoPrevia)
    miniTocador.classList.toggle("tocando", tocando)
    miniTocar.setAttribute("aria-label", tocando ? "Pausar" : "Tocar")

    if (tocandoId && !buscandoPrevia) {
        aparelho.estado(audio.ended ? "Prévia terminada" : tocando ? "Tocando agora" : "Pausado")
    }
}

function atualizarProgresso() {
    const total = Number.isFinite(audio.duration) ? audio.duration : 30
    const atual = audio.currentTime || 0
    const fracao = total > 0 ? Math.min(atual / total, 1) : 0

    aparelho.progresso(atual, total)
    miniBarra.style.width = `${fracao * 100}%`
    listaMusicas.querySelector(`.musica[data-id="${tocandoId}"] .ipod`)?.style.setProperty("--progresso", fracao)
}

function avancar(segundos) {
    if (!tocandoId || !Number.isFinite(audio.duration)) return
    audio.currentTime = Math.min(Math.max(audio.currentTime + segundos, 0), audio.duration)
    atualizarProgresso()
}

function mostrarCapaNoTocador(capa) {
    aparelho.capa(capa)
    miniCapa.style.backgroundImage = capa ? `url("${capa}")` : ""
}

function mostrarMusicaNoTocador(musica, trocou) {
    const matiz = matizDoGenero(musica.genero)

    tocador.style.setProperty("--matiz", matiz)
    miniTocador.style.setProperty("--matiz", matiz)
    aparelho.mostrar({ titulo: musica.titulo, artista: musica.artista, detalhes: detalhesDaMusica(musica), matiz })
    mostrarCapaNoTocador(capas.get(chaveDaMusica(musica)) || null)
    if (trocou) aparelho.trocar()

    miniTitulo.textContent = musica.titulo
    miniArtista.textContent = musica.artista
    tocadorSpotify.href = `https://open.spotify.com/search/${encodeURIComponent(`${musica.titulo} ${musica.artista}`)}`
    tocadorSpotify.setAttribute("aria-label", `Ouvir ${musica.titulo} completa no Spotify`)

    aparelho.progresso(0, 30)
    miniBarra.style.width = "0%"
}

function abrirTocador() {
    if (!tocandoId) return

    if (tocador.hidden || tocador.classList.contains("saindo")) {
        focoAntesDoTocador = document.activeElement
        tocador.classList.remove("saindo")
        tocador.hidden = false
    }

    miniTocador.hidden = true
    document.body.classList.remove("com-player")
    document.body.classList.add("com-modal")
    aparelho.centro.focus({ preventScroll: true })
}

function esconderTocador() {
    if (tocador.hidden) return

    tocador.classList.add("saindo")
    document.body.classList.remove("com-modal")
    setTimeout(() => {
        if (tocador.classList.contains("saindo")) {
            tocador.hidden = true
            tocador.classList.remove("saindo")
        }
    }, reduzirMovimento ? 0 : 280)

    if (focoAntesDoTocador?.isConnected) focoAntesDoTocador.focus({ preventScroll: true })
    focoAntesDoTocador = null
}

function minimizarTocador() {
    esconderTocador()
    if (tocandoId) {
        miniTocador.hidden = false
        document.body.classList.add("com-player")
    }
}

function pararTudo() {
    pedidoAtual++
    tocandoId = null
    buscandoPrevia = false
    audio.pause()
    audio.removeAttribute("src")
    audio.load()

    esconderTocador()
    miniTocador.hidden = true
    document.body.classList.remove("com-player")
    marcarEstado()
}

function alternarTocar() {
    if (!tocandoId || buscandoPrevia) return
    fundoReativo.ligar()
    if (audio.ended) audio.currentTime = 0

    if (audio.paused) {
        audio.play().catch(() => {})
    } else {
        audio.pause()
    }
}

function pularMusica(direcao) {
    const ids = [...listaMusicas.querySelectorAll(".musica:not(.esqueleto)")].map((cartao) => Number(cartao.dataset.id))
    if (ids.length === 0) return

    const posicao = ids.indexOf(tocandoId)
    const destino = posicao < 0 ? ids[0] : ids[(posicao + direcao + ids.length) % ids.length]

    if (destino === tocandoId) {
        avancar(-audio.currentTime)
        return
    }

    tocarMusica(destino, { abrir: !tocador.hidden && !tocador.classList.contains("saindo") })
}

async function tocarMusica(id, { abrir = true } = {}) {
    if (id === tocandoId && !buscandoPrevia) {
        alternarTocar()
        return
    }

    const musica = musicas.find((item) => Number(item.id) === id)
    if (!musica) return

    fundoReativo.ligar()
    const pedido = ++pedidoAtual
    const trocou = tocandoId !== null

    audio.pause()
    tocandoId = id
    buscandoPrevia = true

    mostrarMusicaNoTocador(musica, trocou)
    aparelho.estado("Buscando prévia…")

    if (abrir) {
        abrirTocador()
    } else if (tocador.hidden) {
        miniTocador.hidden = false
        document.body.classList.add("com-player")
    }
    marcarEstado()

    try {
        /* Se a faixa já está guardada, o play() acontece ainda dentro do clique (exigência do Safari) */
        let faixa = faixaGuardada(musica)
        if (faixa === undefined) faixa = await buscarPreviaDaMusica(musica)
        if (pedido !== pedidoAtual) return

        if (!faixa) {
            pararTudo()
            mostrarToast(`Não encontrei a prévia de “${musica.titulo}”.`, "erro")
            return
        }

        const chave = chaveDaMusica(musica)
        if (!capas.get(chave) && capaDaFaixa(faixa)) {
            capas.set(chave, capaDaFaixa(faixa))
            colocarCapaNoCartao(musica)
            mostrarCapaNoTocador(capas.get(chave))
        }

        audio.src = faixa.previewUrl
        await audio.play()
        if (pedido !== pedidoAtual) return

        buscandoPrevia = false
        marcarEstado()
    } catch (erro) {
        if (pedido !== pedidoAtual) return

        /* O navegador bloqueou o som automático: deixa pausado para a pessoa apertar o play */
        if (erro?.name === "NotAllowedError" && audio.src) {
            buscandoPrevia = false
            marcarEstado()
            return
        }

        pararTudo()
        mostrarToast("Não foi possível tocar a prévia.", "erro")
    }
}

audio.addEventListener("play", marcarEstado)
audio.addEventListener("pause", marcarEstado)
audio.addEventListener("ended", marcarEstado)
audio.addEventListener("timeupdate", () => {
    if (tocandoId) atualizarProgresso()
})

/* Teclado dentro do popup: Esc minimiza, setas avançam, espaço pausa, Tab fica preso no popup */
tocador.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") {
        evento.preventDefault()
        minimizarTocador()
    } else if ((evento.key === "ArrowLeft" || evento.key === "ArrowRight") && !evento.target.closest("a")) {
        evento.preventDefault()
        avancar(evento.key === "ArrowRight" ? 5 : -5)
    } else if (evento.key === " " && !evento.target.closest("button, a")) {
        evento.preventDefault()
        alternarTocar()
    } else if (evento.key === "Tab") {
        const focaveis = [...tocador.querySelectorAll("button, a[href]")]
        const primeiro = focaveis[0]
        const ultimo = focaveis[focaveis.length - 1]

        if (evento.shiftKey && document.activeElement === primeiro) {
            evento.preventDefault()
            ultimo.focus()
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
            evento.preventDefault()
            primeiro.focus()
        }
    }
})

tocadorFundo.addEventListener("click", minimizarTocador)
tocadorFechar.addEventListener("click", pararTudo)
miniAbrir.addEventListener("click", abrirTocador)
miniTocar.addEventListener("click", alternarTocar)
miniFechar.addEventListener("click", pararTudo)

listaMusicas.addEventListener("click", (evento) => {
    if (evento.target.closest(".acoes, a, input")) return

    const cartao = evento.target.closest(".musica:not(.esqueleto)")
    if (!cartao) return

    tocarMusica(Number(cartao.dataset.id))
})

mostrarAvisoGuardado()
buscarMusicas()

/* ---------- Apagar ---------- */

function apagarMusica(id) {
    const cartao = listaMusicas.querySelector(`.musica[data-id="${id}"]`)
    if (!cartao || cartao.classList.contains("confirmando")) return

    const acoes = cartao.querySelector(".acoes")
    const acoesOriginais = acoes.innerHTML

    cartao.classList.add("confirmando")
    acoes.innerHTML = `
        <span class="pergunta">Apagar esta música?</span>
        <button class="botao-cancelar">Cancelar</button>
        <button class="botao-confirmar">Apagar</button>
    `

    const [botaoCancelar, botaoConfirmar] = acoes.querySelectorAll("button")

    function cancelar() {
        cartao.classList.remove("confirmando")
        cartao.removeEventListener("keydown", aoTeclar)
        acoes.innerHTML = acoesOriginais
        acoes.querySelector(".apagar").focus()
    }

    function aoTeclar(evento) {
        if (evento.key === "Escape") cancelar()
    }

    cartao.addEventListener("keydown", aoTeclar)
    botaoCancelar.addEventListener("click", cancelar)
    botaoConfirmar.addEventListener("click", () => {
        cartao.removeEventListener("keydown", aoTeclar)
        confirmarApagar(id, cartao, acoesOriginais)
    })
    botaoConfirmar.focus()
}

async function confirmarApagar(id, cartao, acoesOriginais) {
    const acoes = cartao.querySelector(".acoes")
    acoes.innerHTML = `<span class="status"><span class="spinner"></span>Apagando…</span>`

    try {
        const resposta = await buscarComTempo(`${urlBackend}/apagar/${id}`, {
            method: "DELETE"
        })
        if (!resposta.ok) throw new Error("Resposta inválida")

        const respostaTransformada = await resposta.json()

        if (id === tocandoId) pararTudo()

        cartao.classList.add("removendo")
        await esperarAnimacao(cartao, 420)

        musicas = musicas.filter((musica) => musica.id !== id)
        atualizarPainel()
        renderizarLista(false)

        mostrarToast(respostaTransformada.mensagem)
    } catch {
        cartao.classList.remove("confirmando")
        acoes.innerHTML = acoesOriginais
        mostrarToast("Não foi possível apagar. Tente de novo.", "erro")
    }
}
