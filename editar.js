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

function mostrarProblema(titulo, mensagem, comBotaoTentar) {
    formulario.pararPrevia()
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
        formulario.atualizarPrevia()
        formulario.procurarPrevia()
    } catch {
        mostrarProblema("Não foi possível carregar", "O servidor não respondeu. Verifique sua conexão e tente de novo.", true)
    }
}

buscarMusica()

botaoSalvar.addEventListener("click", salvarAlteracoes)

async function salvarAlteracoes() {
    if (botaoSalvar.disabled || painel.classList.contains("carregando-dados")) return

    if (!formulario.validar()) {
        return
    }

    const musica = {
        titulo: inputTitulo.value.trim(),
        artista: inputArtista.value.trim(),
        genero: inputGenero.value.trim(),
        ano: inputAno.valueAsNumber,
        duracao: inputDuracao.valueAsNumber
    }

    formulario.estadoBotao(botaoSalvar, "carregando", "Salvando…")

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

        formulario.pararPrevia()
        formulario.estadoBotao(botaoSalvar, "sucesso", "Alterações salvas")
        try { sessionStorage.setItem("aviso", respostaTransformada.mensagem) } catch {}

        setTimeout(() => formulario.irPara("index.html"), formulario.reduzirMovimento ? 0 : 650)
    } catch {
        formulario.estadoBotao(botaoSalvar, "", "Salvar alterações")
        formulario.mostrarToast("Não foi possível salvar. Tente de novo.", "erro")
    }
}
