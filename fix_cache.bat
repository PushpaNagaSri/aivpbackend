@echo off
echo Deleting corrupted PyTorch Hub cache...
rmdir /s /q "C:\Users\pushp\.cache\torch\hub"
echo Done! Cache deleted.
echo Now restart your server and try again.
pause