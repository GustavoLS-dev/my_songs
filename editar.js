const urlBackend = "https://backend-songs.vercel.app"

const parametros = new URLSearchParams(window.location.search)
const id = parametros.get("id")

const inputTitulo = document.getElementById("titulo")
const inputArtista = document.getElementById("artista")
const inputGenero = document.getElementById("genero")
const inputAno = document.getElementById("ano")
const inputDuracao = document.getElementById("duracao")

const botaoSalvar = document.getElementById("botaoSalvar")

async function buscarMusica() {
    const resposta = await fetch(`${urlBackend}/musica/${id}`)
    const musica = await resposta.json()

    inputTitulo.value = musica.titulo
    inputArtista.value = musica.artista
    inputGenero.value = musica.genero
    inputAno.value = musica.ano
    inputDuracao.value = musica.duracao
}

buscarMusica()

botaoSalvar.addEventListener("click", salvarAlteracoes)

async function salvarAlteracoes() {
    if (
        inputTitulo.value === "" ||
        inputArtista.value === "" ||
        inputGenero.value === "" ||
        inputAno.value === "" ||
        inputDuracao.value === ""
    ) {
        alert("Preencha todos os campos!")
        return
    }

    const musica = {
        titulo: inputTitulo.value,
        artista: inputArtista.value,
        genero: inputGenero.value,
        ano: inputAno.valueAsNumber,
        duracao: inputDuracao.valueAsNumber
    }

    const resposta = await fetch(`${urlBackend}/editar/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(musica)
    })

    const respostaTransformada = await resposta.json()

    alert(respostaTransformada.mensagem)

    window.location.href = "index.html"
}
