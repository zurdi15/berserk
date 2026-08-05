import os
import tempfile

# Debe fijarse antes de importar la app: get_settings() lee el entorno una sola vez
os.environ["BK_DATA_DIR"] = tempfile.mkdtemp(prefix="bk-test-")
# coste mínimo de bcrypt: cada test hace bootstrap/login y el coste real sumaría minutos
os.environ["BK_BCRYPT_ROUNDS"] = "4"
