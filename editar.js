const urlBackend = "https://backend-songs.vercel.app"

const parametros = new URLSearchParams(window.location.search)
const id = parametros.get("id")

const inputTitulo = document.getElementById("titulo")
const inputArtista = document.getElementById("artista")
const inputGenero = document.getElementById("genero")
const inputAno = document.getElementById("ano")
const inputDuracao = document.getElementById("duracao")

const botaoSalvar = document.getElementById("botaoSalvar")

const painel = document.getElementById("painel")
const reduzirMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches
const campos = [inputTitulo, inputArtista, inputGenero, inputAno, inputDuracao]

/* ---------- Utilidades ---------- */

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

function iniciais(titulo) {
    const palavras = String(titulo ?? "").trim().split(/\s+/).filter(Boolean)
    if (palavras.length === 0) return "♪"
    return palavras.slice(0, 2).map((palavra) => palavra[0]).join("").toUpperCase()
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

/* ---------- Transição entre páginas ---------- */

function irPara(endereco) {
    document.body.classList.add("saindo")
    setTimeout(() => { window.location.href = endereco }, reduzirMovimento ? 0 : 180)
}

document.addEventListener("click", (evento) => {
    const link = evento.target.closest("a[href]")
    if (!link || evento.defaultPrevented || evento.button !== 0) return
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey || link.target) return

    const destino = new URL(link.href, window.location.href)
    if (destino.origin !== window.location.origin || destino.href === window.location.href) return

    evento.preventDefault()
    irPara(destino.href)
})

window.addEventListener("pageshow", () => document.body.classList.remove("saindo"))

/* ---------- Prévia ao vivo ---------- */

const previaIniciais = document.getElementById("previaIniciais")
const previaTitulo = document.getElementById("previaTitulo")
const previaArtista = document.getElementById("previaArtista")
const previaGenero = document.getElementById("previaGenero")
const previaAno = document.getElementById("previaAno")
const previaDuracao = document.getElementById("previaDuracao")

function preencherPrevia(elemento, valor, textoVazio) {
    const texto = String(valor ?? "").trim()
    elemento.textContent = texto || textoVazio
    elemento.classList.toggle("vazio", !texto)
}

function atualizarPrevia() {
    preencherPrevia(previaTitulo, inputTitulo.value, "Título da música")
    preencherPrevia(previaArtista, inputArtista.value, "Artista")
    preencherPrevia(previaGenero, inputGenero.value, "Gênero")
    previaAno.textContent = inputAno.value || "Ano"
    previaDuracao.textContent = `${inputDuracao.value || "—"} min`
    previaIniciais.textContent = iniciais(inputTitulo.value)
    document.documentElement.style.setProperty("--matiz", matizDoGenero(inputGenero.value))
}

/* ---------- Validação ---------- */

function marcarCampo(input, mensagem) {
    const campo = input.closest(".campo")
    const erro = document.getElementById(`erro-${input.id}`)

    campo.classList.toggle("invalido", Boolean(mensagem))
    input.setAttribute("aria-invalid", mensagem ? "true" : "false")
    erro.textContent = mensagem

    if (mensagem && !reduzirMovimento) {
        campo.classList.remove("tremer")
        void campo.offsetWidth
        campo.classList.add("tremer")
    }
}

function camposValidos() {
    const vazios = campos.filter((input) => input.value.trim() === "")
    campos.forEach((input) => marcarCampo(input, vazios.includes(input) ? "Preencha este campo" : ""))

    if (vazios.length > 0) {
        vazios[0].focus()
        return false
    }
    return true
}

campos.forEach((input) => {
    input.addEventListener("input", () => {
        if (input.closest(".campo").classList.contains("invalido") && input.value.trim() !== "") {
            marcarCampo(input, "")
        }
        atualizarPrevia()
    })

    input.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") botaoSalvar.click()
    })
})

/* ---------- Estados ---------- */

function estadoBotao(estado, texto) {
    const rotulo = botaoSalvar.querySelector(".rotulo")
    botaoSalvar.classList.remove("carregando", "sucesso")
    if (estado) botaoSalvar.classList.add(estado)
    botaoSalvar.disabled = estado === "carregando" || estado === "sucesso"
    botaoSalvar.setAttribute("aria-busy", estado === "carregando" ? "true" : "false")
    rotulo.textContent = texto
}

function mostrarProblema(titulo, mensagem, comBotaoTentar) {
    document.querySelector(".previa").hidden = true
    document.querySelector(".layout").classList.add("so-painel")
    painel.classList.remove("carregando-dados")
    painel.setAttribute("aria-busy", "false")
    painel.innerHTML = `
        <div class="estado">
            <span class="estado-icone"><svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/></svg></span>
            <h1></h1>
            <p></p>
            ${comBotaoTentar
                ? '<button class="botao-primario" id="tentarDeNovo">Tentar de novo</button>'
                : '<a class="botao-primario" href="index.html">Voltar para a lista</a>'}
        </div>
    `
    painel.querySelector("h1").textContent = titulo
    painel.querySelector("p").textContent = mensagem
    if (comBotaoTentar) {
        document.getElementById("tentarDeNovo").addEventListener("click", () => window.location.reload())
    }
}

/* ---------- Buscar a música ---------- */

async function buscarMusica() {
    if (!id) {
        mostrarProblema("Música não encontrada", "Nenhuma música foi escolhida. Volte para a lista e clique em Editar.", false)
        return
    }

    try {
        const resposta = await buscarComTempo(`${urlBackend}/musica/${id}`)
        if (!resposta.ok) throw new Error("Resposta inválida")

        const texto = await resposta.text()
        const musica = texto ? JSON.parse(texto) : null

        if (!musica) {
            mostrarProblema("Música não encontrada", "Ela pode ter sido apagada. Volte para a lista e escolha outra.", false)
            return
        }

        inputTitulo.value = musica.titulo
        inputArtista.value = musica.artista
        inputGenero.value = musica.genero
        inputAno.value = musica.ano
        inputDuracao.value = musica.duracao

        painel.classList.remove("carregando-dados")
        painel.setAttribute("aria-busy", "false")
        atualizarPrevia()
    } catch {
        mostrarProblema("Não foi possível carregar", "O servidor não respondeu. Verifique sua conexão e tente de novo.", true)
    }
}

buscarMusica()

/* ---------- Salvar ---------- */

botaoSalvar.addEventListener("click", salvarAlteracoes)

async function salvarAlteracoes() {
    if (botaoSalvar.disabled || painel.classList.contains("carregando-dados")) return

    if (!camposValidos()) {
        return
    }

    const musica = {
        titulo: inputTitulo.value.trim(),
        artista: inputArtista.value.trim(),
        genero: inputGenero.value.trim(),
        ano: inputAno.valueAsNumber,
        duracao: inputDuracao.valueAsNumber
    }

    estadoBotao("carregando", "Salvando…")

    try {
        const resposta = await buscarComTempo(`${urlBackend}/editar/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(musica)
        })
        if (!resposta.ok) throw new Error("Resposta inválida")

        const respostaTransformada = await resposta.json()

        estadoBotao("sucesso", "Alterações salvas")
        try { sessionStorage.setItem("aviso", respostaTransformada.mensagem) } catch {}

        setTimeout(() => irPara("index.html"), reduzirMovimento ? 0 : 650)
    } catch {
        estadoBotao("", "Salvar alterações")
        mostrarToast("Não foi possível salvar. Tente de novo.", "erro")
    }
}
