import glob
import os

def main():
    frontend_src = "/home/drdo/Desktop/sim-spack/frontend/src"
    pattern = os.path.join(frontend_src, "**", "*.[jt]s*")
    files = glob.glob(pattern, recursive=True)
    
    replaced_count = 0
    for filepath in files:
        if os.path.isdir(filepath):
            continue
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            
            new_content = content.replace('"http://localhost:5000"', '""').replace("'http://localhost:5000'", "''")
            
            if content != new_content:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(new_content)
                print(f"Updated: {filepath}")
                replaced_count += 1
        except Exception as e:
            print(f"Error processing {filepath}: {e}")
            
    print(f"\nSuccessfully updated {replaced_count} files.")

if __name__ == "__main__":
    main()
