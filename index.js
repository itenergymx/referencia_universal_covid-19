t AWS = require('aws-sdk');
const QRCode = require('qrcode');

const ENUM_Dias = {
    MENOR_4_DIAS: {valor: 0, puntos: 2},
	DE_4_A_7_DIAS: {valor: 1, puntos: 2},
	DE_8_A_14_DIAS: {valor: 2, puntos: 1},
	MAYOR_14_DIAS: {valor: 3, puntos: 0}
}

const ENUM_Sintomas = {
    DOLOR_CABEZA: {valor: 256, puntos: 6},
	FIEBRE_MAYOR_38: {valor: 128, puntos: 6},
	TOS: {valor: 64, puntos: 6},
	DOLOR_ARTICULAR: {valor: 32, puntos: 1},
	DOLOR_MUSCULAR: {valor: 16, puntos: 1},
	DOLOR_GARGANTA: {valor: 8, puntos: 1},
	DOLOR_TORASICO: {valor: 4, puntos: 1},
	ESCURRIMEINTO_NASAL: {valor: 2, puntos: 1},
	DIFICULTAD_RESPIRATORIA: {valor: 1, puntos: 2}
}

let SINTOMAS_PRIMARIOS = ENUM_Sintomas.DOLOR_CABEZA.valor + ENUM_Sintomas.FIEBRE_MAYOR_38.valor + ENUM_Sintomas.TOS.valor;
let SINTOMAS_SECUNDARIOS  = ENUM_Sintomas.DOLOR_ARTICULAR.valor + ENUM_Sintomas.DOLOR_MUSCULAR.valor + ENUM_Sintomas.DOLOR_GARGANTA.valor + ENUM_Sintomas.DOLOR_TORASICO.valor + ENUM_Sintomas.ESCURRIMEINTO_NASAL.valor;

const ENUM_FactoresRiesgo = {
	ENFERMEDAD_PULMONAR: 64,
	ENFERMEDAD_CARDIOVASCULAR: 32,
	ENFERMEDAD_RENAL: 16,
	DIABETES: 8,
	CANCER: 4,
	ENFERMEDAD_AUTOINMUNE: 2,
	EMBARAZO: 1,
	NO: 0
}

const ROJO = "#ff0000ff";
const NARANJA = "#ffa500ff";
const AMARILLO = "#ffff00ff";
const VERDE = "#00ff00ff";

async function procesar(request) {
	var datos;
	try {
		datos = JSON.parse(request);
	} catch(err) {
		datos = request;
	}
	let edad = datos.DATOS_PACIENTE.EDAD;
	let dias = parseInt(datos.CVE_CDO_DIAS, 4);
	let sintomas = parseInt(datos.DATOS_CASO.CVE_CDO_RESP, 2);
	let comorbilidades = parseInt(datos.DATOS_CASO.CVE_RIESGO_FACT, 2);
	
	let dificultadRespiratoria = (ENUM_Sintomas.DIFICULTAD_RESPIRATORIA.valor & sintomas) == ENUM_Sintomas.DIFICULTAD_RESPIRATORIA.valor;
	
	let casoSospechoso = false;
	let adultoMayor = edad >= 60;
	
	let opcionesQR = {color: {}};

	if (dificultadRespiratoria) {
		casoSospechoso = true;
	} else {
		var puntajeSintomas = 0;
		for (const [_, sintoma] of Object.entries(ENUM_Sintomas)) {
			if ((sintoma.valor & sintomas) == sintoma.valor) {
				puntajeSintomas += sintoma.puntos;
			}
		}
		for (const [_, grupo_dias] of Object.entries(ENUM_Dias)) {
			if ((grupo_dias.valor & dias) == grupo_dias.valor) {
				puntajeSintomas += grupo_dias.puntos;
			}
		}
		if (puntajeSintomas > 14) {
			casoSospechoso = true;
		}
	}
	/*
	if (casoSospechoso) {
		// Caso sospechoso A
		if (adultoMayor) {
			if (dificultadRespiratoria) {
				datos.RECOMENDACION = "URGENCIAS";
				opcionesQR.color.light = ROJO;
			} else {
				datos.RECOMENDACION = "ATENCIÓN MEDICA";
				opcionesQR.color.light = NARANJA;
			}
		// Caso sospechoso B
		} else {
			if (dificultadRespiratoria) {
				if (SINTOMAS_PRIMARIOS & sintomas) {
					datos.RECOMENDACION = "URGENCIAS";
					opcionesQR.color.light = ROJO;
				} else {
					datos.RECOMENDACION = "ATENCIÓN MEDICA";
					opcionesQR.color.light = NARANJA;
				}
			} else if (SINTOMAS_PRIMARIOS & sintomas) {
				if (comorbilidades) {
					datos.RECOMENDACION = "ATENCIÓN MEDICA";
					opcionesQR.color.light = NARANJA;
				} else {
					datos.RECOMENDACION = "AISLAMIENTO DOMICILIARIO CON VIGILANCIA DE SÍNTOMAS";
					opcionesQR.color.light = AMARILLO;
				}
			} else {
				datos.RECOMENDACION = "AISLAMIENTO DOMICILIARIO CON VIGILANCIA DE SÍNTOMAS";
				opcionesQR.color.light = AMARILLO;
			}
		}
	} else {
		if (SINTOMAS_PRIMARIOS & sintomas) {
			datos.RECOMENDACION = "AISLAMIENTO DOMICILIARIO CON VIGILANCIA DE SÍNTOMAS";
			opcionesQR.color.light = AMARILLO;
		} else {
			datos.RECOMENDACION = "AISLAMIENTO DOMICILIARIO";
			opcionesQR.color.light = VERDE;
		}
	}
	*/
	if (casoSospechoso) {
		if (dificultadRespiratoria && (adultoMayor || (SINTOMAS_PRIMARIOS & sintomas))) {
			datos.RECOMENDACION = "URGENCIAS";
			opcionesQR.color.light = ROJO;
		} else if (adultoMayor || comorbilidades || dificultadRespiratoria) {
			datos.RECOMENDACION = "ATENCIÓN MEDICA";
			opcionesQR.color.light = NARANJA;
		} else {
			datos.RECOMENDACION = "AISLAMIENTO DOMICILIARIO CON VIGILANCIA DE SÍNTOMAS";
			opcionesQR.color.light = AMARILLO;
		}
	} else {
		if (SINTOMAS_PRIMARIOS & sintomas) {
			datos.RECOMENDACION = "AISLAMIENTO DOMICILIARIO CON VIGILANCIA DE SÍNTOMAS";
			opcionesQR.color.light = AMARILLO;
		} else {
			datos.RECOMENDACION = "AISLAMIENTO DOMICILIARIO";
			opcionesQR.color.light = VERDE;
		}
	}
	datos.QR = await QRCode.toDataURL(JSON.stringify(datos), opcionesQR);
	return datos
}

exports.handler = async (event, context) => {
	let body;
	let statusCode = '200';
	const headers = {
		'Content-Type': 'application/json',
	};

	try {
		body = await procesar(event.body);
	} catch (err) {
		statusCode = '400';
		body = "El archivo recibido no cumple con la especificación";
	} finally {
		body = JSON.stringify(body);
	}
	
	console.log(body);

	return {
		statusCode,
		body,
		headers,
	};
};
