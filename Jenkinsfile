properties(commonModuleJobProps())

node('maven-jdk17') {
    stage('Build shipping estimator') {
        checkout scm
        dir('services/shipping-estimator') {
            sh 'npm ci'
            sh 'npm run build'
            sh 'npm test'
        }
    }
}

buildBroadleafModule(params, false, 'maven-jdk17')
