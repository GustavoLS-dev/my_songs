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

const player = document.getElementById("player")
const audio = new Audio()
let tocandoId = null

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
    const estado = ativa ? (player.classList.contains("buscando") ? " buscando" : (!audio.paused ? " tocando" : "")) : ""

    return `
        <article class="musica${estado}" data-id="${Number(musica.id)}" style="--i: ${posicao}; --matiz: ${matizDoGenero(musica.genero)}">
            <button class="capa" aria-label="Tocar prévia de ${escapar(musica.titulo)}">
                ${fitaSVG(null, capas.get(chaveDaMusica(musica)) || null)}
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
                <a class="editar" href="editar.html?id=${Number(musica.id)}">Editar</a>
                <button class="apagar" onclick="apagarMusica(${Number(musica.id)})">Apagar</button>
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
    const cartao = listaMusicas.querySelector(`.musica[data-id="${Number(musica.id)}"]`)
    const fitaAntiga = cartao?.querySelector(".capa .fita")
    if (!capa || !fitaAntiga) return

    const progresso = fitaAntiga.style.getPropertyValue("--progresso")
    fitaAntiga.outerHTML = fitaSVG(null, capa)
    if (progresso) cartao.querySelector(".capa .fita").style.setProperty("--progresso", progresso)
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

/* ---------- Player (prévia de 30s do iTunes) ---------- */

const playerFita = document.getElementById("playerFita")
const playerRotulo = document.getElementById("playerRotulo")
const playerTitulo = document.getElementById("playerTitulo")
const playerArtista = document.getElementById("playerArtista")
const playerTempo = document.getElementById("playerTempo")
const playerTotal = document.getElementById("playerTotal")
const playerBarra = document.getElementById("playerBarra")
const playerTocar = document.getElementById("playerTocar")
const playerSpotify = document.getElementById("playerSpotify")
const playerFechar = document.getElementById("playerFechar")

let pedidoAtual = 0

function marcarCartoes() {
    const buscando = player.classList.contains("buscando")
    const tocando = Boolean(tocandoId) && !buscando && !audio.paused

    listaMusicas.querySelectorAll(".musica:not(.esqueleto)").forEach((cartao) => {
        const ativa = Number(cartao.dataset.id) === tocandoId
        const titulo = cartao.querySelector("h2")?.textContent || ""

        cartao.classList.toggle("buscando", ativa && buscando)
        cartao.classList.toggle("tocando", ativa && tocando)
        cartao.querySelector(".capa")?.setAttribute("aria-label", `${ativa && tocando ? "Pausar" : "Tocar"} prévia de ${titulo}`)
        if (!ativa) cartao.querySelector(".fita")?.style.removeProperty("--progresso")
    })

    player.classList.toggle("tocando", tocando)
    playerTocar.setAttribute("aria-label", tocando ? "Pausar" : "Tocar")
}

function atualizarProgresso(atual, total) {
    const fracao = total > 0 ? Math.min(atual / total, 1) : 0

    playerFita.querySelector(".fita")?.style.setProperty("--progresso", fracao)
    listaMusicas.querySelector(`.musica[data-id="${tocandoId}"] .fita`)?.style.setProperty("--progresso", fracao)

    playerBarra.value = Math.round(fracao * 1000)
    playerBarra.style.setProperty("--preenchido", `${fracao * 100}%`)
    playerTempo.textContent = formatarTempo(atual)
    playerTotal.textContent = formatarTempo(total)
}

function abrirPlayer(musica) {
    player.style.setProperty("--matiz", matizDoGenero(musica.genero))
    playerFita.innerHTML = fitaSVG(rotuloDaFita(musica.titulo), capas.get(chaveDaMusica(musica)) || null)
    playerTitulo.textContent = musica.titulo
    playerArtista.textContent = musica.artista
    playerSpotify.href = `https://open.spotify.com/search/${encodeURIComponent(`${musica.titulo} ${musica.artista}`)}`
    playerSpotify.setAttribute("aria-label", `Ouvir ${musica.titulo} no Spotify`)
    atualizarProgresso(0, 30)

    player.hidden = false
    document.body.classList.add("com-player")
}

function fecharPlayer() {
    pedidoAtual++
    tocandoId = null
    audio.pause()
    audio.removeAttribute("src")
    audio.load()

    player.classList.remove("buscando", "tocando")
    player.hidden = true
    document.body.classList.remove("com-player")
    marcarCartoes()
}

async function tocarMusica(id) {
    if (id === tocandoId && !player.classList.contains("buscando")) {
        if (audio.paused) {
            audio.play().catch(() => {})
        } else {
            audio.pause()
        }
        return
    }

    const musica = musicas.find((item) => Number(item.id) === id)
    if (!musica) return

    const pedido = ++pedidoAtual
    audio.pause()
    tocandoId = id

    abrirPlayer(musica)
    player.classList.add("buscando")
    playerRotulo.textContent = "Buscando prévia…"
    marcarCartoes()

    try {
        const faixa = await buscarPreviaDaMusica(musica)
        if (pedido !== pedidoAtual) return

        if (!faixa) {
            fecharPlayer()
            mostrarToast(`Não encontrei a prévia de “${musica.titulo}”.`, "erro")
            return
        }

        const chave = chaveDaMusica(musica)
        if (!capas.get(chave) && capaDaFaixa(faixa)) {
            capas.set(chave, capaDaFaixa(faixa))
            playerFita.innerHTML = fitaSVG(rotuloDaFita(musica.titulo), capas.get(chave))
            colocarCapaNoCartao(musica)
        }

        audio.src = faixa.previewUrl
        await audio.play()
        if (pedido !== pedidoAtual) return

        player.classList.remove("buscando")
        playerRotulo.textContent = "Tocando prévia"
        marcarCartoes()
    } catch {
        if (pedido !== pedidoAtual) return
        fecharPlayer()
        mostrarToast("Não foi possível tocar a prévia.", "erro")
    }
}

audio.addEventListener("play", () => {
    if (!player.classList.contains("buscando")) playerRotulo.textContent = "Tocando prévia"
    marcarCartoes()
})

audio.addEventListener("pause", () => {
    if (tocandoId && !audio.ended && !player.classList.contains("buscando")) playerRotulo.textContent = "Pausado"
    marcarCartoes()
})

audio.addEventListener("ended", () => {
    playerRotulo.textContent = "Prévia terminada"
    marcarCartoes()
})

audio.addEventListener("timeupdate", () => {
    if (tocandoId) atualizarProgresso(audio.currentTime, audio.duration || 30)
})

playerTocar.addEventListener("click", () => {
    if (!tocandoId) return
    if (audio.ended) audio.currentTime = 0
    if (audio.paused) {
        audio.play().catch(() => {})
    } else {
        audio.pause()
    }
})

playerBarra.addEventListener("input", () => {
    if (Number.isFinite(audio.duration)) {
        audio.currentTime = (playerBarra.value / 1000) * audio.duration
    }
})

playerFechar.addEventListener("click", fecharPlayer)

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

        if (id === tocandoId) fecharPlayer()

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
