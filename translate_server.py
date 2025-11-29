from flask import Flask, request, jsonify
from googletrans import Translator

app = Flask(__name__)
translator = Translator()

@app.route('/translate', methods=['POST'])
def translate():
    data = request.get_json(force=True)
    result = translator.translate(data['q'], dest=data['target'])
    return jsonify({'translatedText': result.text})

app.run(port=5000)
