const urlBackend = "https://backend-songs.vercel.app"

const inputTitulo = document.getElementById("titulo")
const inputArtista = document.getElementById("artista")
const inputGenero = document.getElementById("genero")
const inputAno = document.getElementById("ano")
const inputDuracao = document.getElementById("duracao")

const botaoCadastrar = document.getElementById("botaoCadastrar")

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
    const texto = valor.trim()
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
        if (evento.key === "Enter") botaoCadastrar.click()
    })
})

/* ---------- Estados do botão ---------- */

function estadoBotao(estado, texto) {
    const rotulo = botaoCadastrar.querySelector(".rotulo")
    botaoCadastrar.classList.remove("carregando", "sucesso")
    if (estado) botaoCadastrar.classList.add(estado)
    botaoCadastrar.disabled = estado === "carregando" || estado === "sucesso"
    botaoCadastrar.setAttribute("aria-busy", estado === "carregando" ? "true" : "false")
    rotulo.textContent = texto
}

/* ---------- Cadastrar ---------- */

botaoCadastrar.addEventListener("click", cadastrarMusica)

async function cadastrarMusica() {
    if (botaoCadastrar.disabled) return

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

    estadoBotao("carregando", "Cadastrando…")

    try {
        const resposta = await buscarComTempo(`${urlBackend}/cadastrar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(musica)
        })
        if (!resposta.ok) throw new Error("Resposta inválida")

        const respostaTransformada = await resposta.json()

        estadoBotao("sucesso", "Música cadastrada")
        try { sessionStorage.setItem("aviso", respostaTransformada.mensagem) } catch {}

        setTimeout(() => irPara("index.html"), reduzirMovimento ? 0 : 650)
    } catch {
        estadoBotao("", "Cadastrar")
        mostrarToast("Não foi possível cadastrar. Tente de novo.", "erro")
    }
}

atualizarPrevia()
