const urlBackend = "https://backend-songs.vercel.app"

const inputTitulo = document.getElementById("titulo")
const inputArtista = document.getElementById("artista")
const inputGenero = document.getElementById("genero")
const inputAno = document.getElementById("ano")
const inputDuracao = document.getElementById("duracao")

const botaoCadastrar = document.getElementById("botaoCadastrar")

botaoCadastrar.addEventListener("click", cadastrarMusica)

async function cadastrarMusica() {
    if (botaoCadastrar.disabled) return

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

    formulario.estadoBotao(botaoCadastrar, "carregando", "Cadastrando…")

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

        formulario.pararPrevia()
        formulario.estadoBotao(botaoCadastrar, "sucesso", "Música cadastrada")
        try { sessionStorage.setItem("aviso", respostaTransformada.mensagem) } catch {}

        setTimeout(() => formulario.irPara("index.html"), formulario.reduzirMovimento ? 0 : 650)
    } catch {
        formulario.estadoBotao(botaoCadastrar, "", "Cadastrar")
        formulario.mostrarToast("Não foi possível cadastrar. Tente de novo.", "erro")
    }
}
